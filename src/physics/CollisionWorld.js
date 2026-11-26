// Module: src/physics/CollisionWorld.js
__define("src/physics/CollisionWorld.js", (__exports, __require) => {
const SKIN_EPS = 0.002;
const GROUND_PROBE = 0.03;
const JUMP_PAD_COOLDOWN = 0.32;

/**
 * High-performance AABB collision & raycasting world for NEON PROTOCOL.
 * Provides glitch-free separated-axis sliding capsule movement with automatic
 * step-up (with headroom validation), jump pad triggers, and exact Slab raycasting.
 */
class CollisionWorld {
  constructor() {
    /** @type {Array<{id:number, minX:number, minY:number, minZ:number, maxX:number, maxY:number, maxZ:number, tag:string}>} */
    this._boxes = [];
    /** @type {Array<{id:number, x:number, y:number, z:number, radius:number, launchVy:number, launchDirX:number, launchDirZ:number, lastTriggerTime:number}>} */
    this._jumpPads = [];
    this._nextBoxId = 1;
    this._nextPadId = 1;

    // Arena safety limits (expanded automatically or configurable via setArenaBounds)
    this._bounds = {
      minX: -120,
      maxX: 120,
      minZ: -120,
      maxZ: 120,
      minY: 0,
      maxY: 60,
    };
    this._hasCustomBounds = false;

    // Pre-allocated scratch structures for zero-GC hot loops
    this._moveResult = {
      grounded: false,
      hitWall: false,
      wallNormal: new THREE.Vector3(),
      onJumpPad: false,
      jumpPad: null,
    };
    this._rayDir = new THREE.Vector3();
    this._losDir = new THREE.Vector3();
    this._losScratchResult = {
      hit: false,
      distance: 0,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      tag: '',
    };
  }

  /**
   * Optional explicit arena bounds clamp.
   */
  setArenaBounds(minX, maxX, minZ, maxZ, minY = 0, maxY = 60) {
    this._bounds.minX = Math.min(minX, maxX);
    this._bounds.maxX = Math.max(minX, maxX);
    this._bounds.minZ = Math.min(minZ, maxZ);
    this._bounds.maxZ = Math.max(minZ, maxZ);
    this._bounds.minY = minY;
    this._bounds.maxY = maxY;
    this._hasCustomBounds = true;
  }

  /**
   * Register a static axis-aligned collider box.
   * @returns {{id:number, minX:number, minY:number, minZ:number, maxX:number, maxY:number, maxZ:number, tag:string}}
   */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'wall') {
    const bxMinX = Math.min(minX, maxX);
    const bxMaxX = Math.max(minX, maxX);
    const bxMinY = Math.min(minY, maxY);
    const bxMaxY = Math.max(minY, maxY);
    const bxMinZ = Math.min(minZ, maxZ);
    const bxMaxZ = Math.max(minZ, maxZ);

    const box = {
      id: this._nextBoxId++,
      minX: bxMinX,
      minY: bxMinY,
      minZ: bxMinZ,
      maxX: bxMaxX,
      maxY: bxMaxY,
      maxZ: bxMaxZ,
      tag,
    };
    this._boxes.push(box);

    // If a map places sunken floor surfaces below y=0, relax default safety floor
    if (!this._hasCustomBounds && bxMaxY < this._bounds.minY && bxMaxY > -30) {
      this._bounds.minY = bxMaxY;
    }

    return box;
  }

  /**
   * Remove a collider box by its id.
   * @param {number} id
   * @returns {boolean}
   */
  removeBox(id) {
    for (let i = 0; i < this._boxes.length; i++) {
      if (this._boxes[i].id === id) {
        this._boxes.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Register a jump pad trigger zone.
   */
  addJumpPad(x, y, z, radius, launchVy, launchDirX = 0, launchDirZ = 0) {
    const pad = {
      id: this._nextPadId++,
      x,
      y,
      z,
      radius,
      launchVy,
      launchDirX,
      launchDirZ,
      lastTriggerTime: -10,
    };
    this._jumpPads.push(pad);
    return pad;
  }

  /**
   * Clear all registered boxes and jump pads.
   */
  clear() {
    this._boxes.length = 0;
    this._jumpPads.length = 0;
    this._hasCustomBounds = false;
    this._bounds.minX = -120;
    this._bounds.maxX = 120;
    this._bounds.minZ = -120;
    this._bounds.maxZ = 120;
    this._bounds.minY = 0;
    this._bounds.maxY = 60;
  }

  /**
   * Return all registered AABB boxes (for minimap & AI navigation).
   */
  getBoxes() {
    return this._boxes;
  }

  /**
   * Return all registered jump pads.
   */
  getJumpPads() {
    return this._jumpPads;
  }

  /**
   * Test whether an upright capsule AABB [x-r, x+r] x [y+0.02, y+height] x [z-r, z+r]
   * has full unobstructed clearance against all world boxes.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} radius
   * @param {number} height
   * @returns {boolean}
   */
  hasClearance(x, y, z, radius, height) {
    const boxes = this._boxes;
    const minX = x - radius + SKIN_EPS;
    const maxX = x + radius - SKIN_EPS;
    const minY = y + 0.02;
    const maxY = y + height - SKIN_EPS;
    const minZ = z - radius + SKIN_EPS;
    const maxZ = z + radius - SKIN_EPS;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        maxX > b.minX &&
        minX < b.maxX &&
        maxY > b.minY &&
        minY < b.maxY &&
        maxZ > b.minZ &&
        minZ < b.maxZ
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resolve horizontal movement along a single axis ('x' or 'z') with automatic step-up.
   * @private
   */
  _moveHorizontalAxis(pos, vel, radius, height, delta, axis, stepHeight, result) {
    if (Math.abs(delta) < 1e-7) return;

    const boxes = this._boxes;
    const oldVal = axis === 'x' ? pos.x : pos.z;
    const targetVal = oldVal + delta;
    const otherVal = axis === 'x' ? pos.z : pos.x;

    const minY = pos.y + SKIN_EPS;
    const maxY = pos.y + height - SKIN_EPS;
    const otherMin = otherVal - radius + SKIN_EPS;
    const otherMax = otherVal + radius - SKIN_EPS;

    let blocked = false;
    let clampedVal = targetVal;
    // Prevent mid-air step-up exploits while jumping upward
    let canStep = stepHeight > 0 && vel.y <= 0.1;
    let highestStepY = pos.y;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];

      // Vertical overlap check
      if (maxY <= b.minY || minY >= b.maxY) continue;

      // Cross-axis overlap check
      const bOtherMin = axis === 'x' ? b.minZ : b.minX;
      const bOtherMax = axis === 'x' ? b.maxZ : b.maxX;
      if (otherMax <= bOtherMin || otherMin >= bOtherMax) continue;

      // Moving-axis overlap check
      const bMin = axis === 'x' ? b.minX : b.minZ;
      const bMax = axis === 'x' ? b.maxX : b.maxZ;
      if (targetVal + radius <= bMin || targetVal - radius >= bMax) continue;

      // Directional face-entry guard: prevent back-face wall-glue when moving away from a grazing face
      const bCenter = (bMin + bMax) * 0.5;
      if (delta > 0) {
        if (oldVal + radius > bMin + 0.08 && oldVal >= bCenter) continue;
      } else {
        if (oldVal - radius < bMax - 0.08 && oldVal <= bCenter) continue;
      }

      // Collision detected along this axis
      blocked = true;
      const rise = b.maxY - pos.y;

      if (canStep && rise > 0 && rise <= stepHeight) {
        if (b.maxY > highestStepY) {
          highestStepY = b.maxY;
        }
      } else {
        canStep = false;
      }

      if (delta > 0) {
        const candidate = bMin - radius - SKIN_EPS;
        if (candidate < clampedVal) clampedVal = candidate;
      } else {
        const candidate = bMax + radius + SKIN_EPS;
        if (candidate > clampedVal) clampedVal = candidate;
      }
    }

    if (!blocked) {
      if (axis === 'x') pos.x = targetVal;
      else pos.z = targetVal;
      return;
    }

    // Attempt step-up if not jumping upward and every blocking obstacle is <= stepHeight
    if (canStep && vel.y <= 0.1 && highestStepY > pos.y) {
      const destX = axis === 'x' ? targetVal : pos.x;
      const destZ = axis === 'z' ? targetVal : pos.z;

      // Verify headroom at current spot AND full clearance at destination spot
      if (
        this.hasClearance(pos.x, highestStepY, pos.z, radius, height) &&
        this.hasClearance(destX, highestStepY, destZ, radius, height)
      ) {
        pos.x = destX;
        pos.z = destZ;
        pos.y = highestStepY;
        if (vel.y < 0) vel.y = 0;
        if (vel.y <= 0.1) {
          result.grounded = true;
        }
        return;
      }
    }

    // Cannot step up: slide cleanly along wall
    if (axis === 'x') {
      pos.x = clampedVal;
      vel.x = 0;
      result.hitWall = true;
      result.wallNormal.x = delta > 0 ? -1 : 1;
    } else {
      pos.z = clampedVal;
      vel.z = 0;
      result.hitWall = true;
      result.wallNormal.z = delta > 0 ? -1 : 1;
    }
  }

  /**
   * Resolve vertical movement with crisp floor landing and ceiling bonk.
   * @private
   */
  _moveVertical(pos, vel, radius, height, dy, result) {
    const boxes = this._boxes;
    const minX = pos.x - radius + SKIN_EPS;
    const maxX = pos.x + radius - SKIN_EPS;
    const minZ = pos.z - radius + SKIN_EPS;
    const maxZ = pos.z + radius - SKIN_EPS;

    const oldY = pos.y;
    const nextY = oldY + dy;

    if (dy <= 0) {
      let landed = false;
      let highestFloor = -Infinity;

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (maxX <= b.minX || minX >= b.maxX || maxZ <= b.minZ || minZ >= b.maxZ) continue;

        // Swept downward landing onto box top
        if (oldY >= b.maxY - 0.08 && nextY <= b.maxY + SKIN_EPS && nextY + height > b.minY) {
          if (b.maxY > highestFloor) {
            highestFloor = b.maxY;
            landed = true;
          }
        }
      }

      if (landed) {
        pos.y = highestFloor;
        vel.y = 0;
        result.grounded = true;
      } else {
        pos.y = nextY;
      }
    } else {
      let hitCeiling = false;
      let lowestCeil = Infinity;

      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (maxX <= b.minX || minX >= b.maxX || maxZ <= b.minZ || minZ >= b.maxZ) continue;

        // Swept upward bonk against box underside
        if (oldY + height <= b.minY + 0.08 && nextY + height >= b.minY - SKIN_EPS && nextY < b.maxY) {
          if (b.minY < lowestCeil) {
            lowestCeil = b.minY;
            hitCeiling = true;
          }
        }
      }

      if (hitCeiling) {
        pos.y = lowestCeil - height - SKIN_EPS;
        vel.y = 0;
      } else {
        pos.y = nextY;
      }
    }

    // Ground probe when standing still or lightly brushing floor
    if (!result.grounded && vel.y <= 0.01) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (maxX <= b.minX || minX >= b.maxX || maxZ <= b.minZ || minZ >= b.maxZ) continue;
        if (pos.y >= b.maxY - 0.04 && pos.y <= b.maxY + GROUND_PROBE) {
          pos.y = b.maxY;
          if (vel.y < 0) vel.y = 0;
          result.grounded = true;
          break;
        }
      }
    }
  }

  /**
   * Resolve sliding capsule movement against all boxes, bounds, and optional jump pads.
   * Reuses an internal result object for zero allocations per frame.
   *
   * @param {THREE.Vector3} pos - Feet position (mutated in-place)
   * @param {THREE.Vector3} vel - Velocity vector (mutated in-place)
   * @param {number} radius
   * @param {number} height
   * @param {number} dt
   * @param {number} [stepHeight=0.55]
   * @param {boolean} [triggerJumpPads=true]
   * @returns {{ grounded: boolean, hitWall: boolean, wallNormal: THREE.Vector3, onJumpPad: boolean, jumpPad: any }}
   */
  resolveCapsuleMove(pos, vel, radius, height, dt, stepHeight = 0.55, triggerJumpPads = true) {
    const res = this._moveResult;
    res.grounded = false;
    res.hitWall = false;
    res.wallNormal.set(0, 0, 0);
    res.onJumpPad = false;
    res.jumpPad = null;

    if (!Number.isFinite(dt) || dt <= 0) {
      return res;
    }

    // Clamp extreme dt and sub-step high-speed movement (e.g. dashes) to prevent tunneling
    const clampedDt = Math.min(dt, 0.1);
    const maxStepDist = Math.max(0.15, radius * 0.55);
    const frameDist = Math.hypot(vel.x * clampedDt, vel.y * clampedDt, vel.z * clampedDt);
    const steps = Math.max(1, Math.min(6, Math.ceil(frameDist / maxStepDist)));
    const subDt = clampedDt / steps;

    for (let s = 0; s < steps; s++) {
      // Reset grounded per substep so walking off a ledge on a later substep never leaks stale grounded
      res.grounded = false;

      // Separate X then Z horizontal sweeps with automatic ledge step-up
      this._moveHorizontalAxis(pos, vel, radius, height, vel.x * subDt, 'x', stepHeight, res);
      this._moveHorizontalAxis(pos, vel, radius, height, vel.z * subDt, 'z', stepHeight, res);

      // Vertical sweep with crisp landing & ceiling bonk
      this._moveVertical(pos, vel, radius, height, vel.y * subDt, res);
    }

    if (res.hitWall && res.wallNormal.lengthSq() > 0) {
      res.wallNormal.normalize();
    }

    // Arena safety bounds enforcement
    const bounds = this._bounds;
    if (pos.x < bounds.minX + radius) {
      pos.x = bounds.minX + radius;
      if (vel.x < 0) vel.x = 0;
      res.hitWall = true;
      res.wallNormal.set(1, 0, 0);
    } else if (pos.x > bounds.maxX - radius) {
      pos.x = bounds.maxX - radius;
      if (vel.x > 0) vel.x = 0;
      res.hitWall = true;
      res.wallNormal.set(-1, 0, 0);
    }

    if (pos.z < bounds.minZ + radius) {
      pos.z = bounds.minZ + radius;
      if (vel.z < 0) vel.z = 0;
      res.hitWall = true;
      res.wallNormal.set(0, 0, 1);
    } else if (pos.z > bounds.maxZ - radius) {
      pos.z = bounds.maxZ - radius;
      if (vel.z > 0) vel.z = 0;
      res.hitWall = true;
      res.wallNormal.set(0, 0, -1);
    }

    if (pos.y < bounds.minY) {
      pos.y = bounds.minY;
      if (vel.y < 0) vel.y = 0;
      res.grounded = true;
    } else if (pos.y + height > bounds.maxY) {
      pos.y = bounds.maxY - height;
      if (vel.y > 0) vel.y = 0;
    }

    // Jump pad trigger check with per-pad cooldown safety (disabled for AI when triggerJumpPads=false)
    const pads = this._jumpPads;
    if (triggerJumpPads && pads.length > 0) {
      const now = performance.now() * 0.001;
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (now - pad.lastTriggerTime < JUMP_PAD_COOLDOWN) continue;

        const dx = pos.x - pad.x;
        const dz = pos.z - pad.z;
        const triggerR = pad.radius + radius * 0.45;
        if (
          dx * dx + dz * dz <= triggerR * triggerR &&
          pos.y >= pad.y - 0.5 &&
          pos.y <= pad.y + 1.15
        ) {
          pad.lastTriggerTime = now;
          vel.y = pad.launchVy;
          if (pad.launchDirX !== 0 || pad.launchDirZ !== 0) {
            const horizMag = Math.hypot(pad.launchDirX, pad.launchDirZ);
            // Support either unit direction vectors (boost by 11 m/s) or direct velocity components
            const scale = horizMag <= 1.05 ? 11.0 : 1.0;
            vel.x = pad.launchDirX * scale;
            vel.z = pad.launchDirZ * scale;
          }
          res.grounded = false;
          res.onJumpPad = true;
          res.jumpPad = pad;
          break;
        }
      }
    }

    return res;
  }

  /**
   * Exact Slab-method Ray-vs-AABB intersection against the collision world.
   * Handles origins strictly inside solid boxes (immediate hit at t=0) while
   * ignoring outward-pointing rays starting on a surface (tmax < 1e-4).
   *
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} dir
   * @param {number} [maxDist=200]
   * @param {{hit:boolean, distance:number, point:THREE.Vector3, normal:THREE.Vector3, tag:string}|null} [outResult=null]
   * @returns {{hit:true, distance:number, point:THREE.Vector3, normal:THREE.Vector3, tag:string}|null}
   */
  raycastWorld(origin, dir, maxDist = 200, outResult = null) {
    const rayDir = this._rayDir.copy(dir);
    const lenSq = rayDir.lengthSq();
    if (lenSq < 1e-12) return null;
    if (Math.abs(lenSq - 1) > 1e-5) {
      rayDir.multiplyScalar(1 / Math.sqrt(lenSq));
    }

    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = rayDir.x;
    const dy = rayDir.y;
    const dz = rayDir.z;

    const invDx = Math.abs(dx) > 1e-8 ? 1 / dx : 0;
    const invDy = Math.abs(dy) > 1e-8 ? 1 / dy : 0;
    const invDz = Math.abs(dz) > 1e-8 ? 1 / dz : 0;

    let closestT = maxDist;
    let hitBox = null;
    let hitNx = 0;
    let hitNy = 0;
    let hitNz = 0;

    const boxes = this._boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];

      let tmin = -Infinity;
      let tmax = Infinity;
      let nx = 0;
      let ny = 0;
      let nz = 0;

      // X slab
      if (invDx !== 0) {
        let t1 = (b.minX - ox) * invDx;
        let t2 = (b.maxX - ox) * invDx;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          nx = sign;
          ny = 0;
          nz = 0;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      } else if (ox < b.minX || ox > b.maxX) {
        continue;
      }

      // Y slab
      if (invDy !== 0) {
        let t1 = (b.minY - oy) * invDy;
        let t2 = (b.maxY - oy) * invDy;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          nx = 0;
          ny = sign;
          nz = 0;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      } else if (oy < b.minY || oy > b.maxY) {
        continue;
      }

      // Z slab
      if (invDz !== 0) {
        let t1 = (b.minZ - oz) * invDz;
        let t2 = (b.maxZ - oz) * invDz;
        let sign = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          sign = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          nx = 0;
          ny = 0;
          nz = sign;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      } else if (oz < b.minZ || oz > b.maxZ) {
        continue;
      }

      // Ignore boxes completely behind origin or grazed outward from surface
      if (tmax < 1e-4) continue;

      // Origin strictly inside box hits immediately at t = 0
      const inside = tmin < 0;
      const hitT = inside ? 0 : tmin;
      if (hitT < closestT) {
        closestT = hitT;
        hitBox = b;
        if (inside || (nx === 0 && ny === 0 && nz === 0)) {
          hitNx = -dx;
          hitNy = -dy;
          hitNz = -dz;
        } else {
          hitNx = nx;
          hitNy = ny;
          hitNz = nz;
        }
      }
    }

    if (!hitBox) return null;

    if (outResult) {
      outResult.hit = true;
      outResult.distance = closestT;
      outResult.point.set(
        ox + dx * closestT,
        oy + dy * closestT,
        oz + dz * closestT
      );
      outResult.normal.set(hitNx, hitNy, hitNz);
      outResult.tag = hitBox.tag;
      return outResult;
    }

    return {
      hit: true,
      distance: closestT,
      point: new THREE.Vector3(
        ox + dx * closestT,
        oy + dy * closestT,
        oz + dz * closestT
      ),
      normal: new THREE.Vector3(hitNx, hitNy, hitNz),
      tag: hitBox.tag,
    };
  }

  /**
   * Check whether an unobstructed line of sight exists between two world points.
   * Zero allocations.
   *
   * @param {THREE.Vector3} fromPos
   * @param {THREE.Vector3} toPos
   * @returns {boolean}
   */
  isLineOfSightClear(fromPos, toPos) {
    this._losDir.subVectors(toPos, fromPos);
    const dist = this._losDir.length();
    if (dist <= 0.05) return true;
    this._losDir.multiplyScalar(1 / dist);
    const hit = this.raycastWorld(fromPos, this._losDir, dist - 0.05, this._losScratchResult);
    return hit === null;
  }

  /**
   * Return the highest box top surface containing (x, z) with box.maxY <= maxY.
   * Defaults to 0 if no box covers (x, z).
   *
   * @param {number} x
   * @param {number} z
   * @param {number} [maxY=20]
   * @returns {number}
   */
  getGroundHeightAt(x, z, maxY = 20) {
    let found = false;
    let bestY = -Infinity;
    const boxes = this._boxes;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        x >= b.minX &&
        x <= b.maxX &&
        z >= b.minZ &&
        z <= b.maxZ &&
        b.maxY <= maxY
      ) {
        if (!found || b.maxY > bestY) {
          bestY = b.maxY;
          found = true;
        }
      }
    }

    return found ? bestY : 0;
  }
}
  __exports.CollisionWorld = CollisionWorld;
});
