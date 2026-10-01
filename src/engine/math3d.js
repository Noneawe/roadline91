// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal vec3 / mat4 math on Float32Array, column-major, right-handed (camera looks down -Z).
// No DOM or WebGL references: testable in Node.

/**
 * @param {Float32Array} out
 * @returns {Float32Array}
 */
export function mat4Identity(out) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

/**
 * out = a * b. `out` may alias `a` or `b`.
 * @param {Float32Array} out
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {Float32Array}
 */
export function mat4Multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let c = 0; c < 16; c += 4) {
    const b0 = b[c], b1 = b[c + 1], b2 = b[c + 2], b3 = b[c + 3];
    out[c] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

/**
 * Perspective projection defined by the horizontal field of view.
 * @param {Float32Array} out
 * @param {number} fovX horizontal FOV in radians
 * @param {number} aspect display width / height (4:3, not the buffer ratio)
 * @param {number} near
 * @param {number} far
 * @returns {Float32Array}
 */
export function mat4Perspective(out, fovX, aspect, near, far) {
  const f = 1 / Math.tan(fovX / 2);
  out.fill(0);
  out[0] = f;
  out[5] = f * aspect;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/**
 * View matrix looking from `eye` towards `target`.
 * @param {Float32Array} out
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} target
 * @param {ArrayLike<number>} up
 * @returns {Float32Array}
 */
export function mat4LookAt(out, eye, target, up) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = 1 / hypot3(zx, zy, zz);
  zx *= l; zy *= l; zz *= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = 1 / hypot3(xx, xy, xz);
  xx *= l; xy *= l; xz *= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/**
 * Model matrix: translate(x, y, z) * rotateY(yaw) * rotateX(pitch) * rotateZ(roll).
 * @param {Float32Array} out
 * @param {number} yaw radians, positive turns left (counter-clockwise seen from above)
 * @param {number} pitch radians, positive raises the -Z (front) end
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} [roll] radians, positive raises the +X (right) side
 * @returns {Float32Array}
 */
export function mat4FromYawPitch(out, yaw, pitch, x, y, z, roll = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = s * sp; out[5] = cp; out[6] = c * sp; out[7] = 0;
  out[8] = s * cp; out[9] = -sp; out[10] = c * cp; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < 3; i++) {
      const ax = out[i], ay = out[4 + i];
      out[i] = ax * cr + ay * sr;
      out[4 + i] = ay * cr - ax * sr;
    }
  }
  return out;
}

/**
 * General 4x4 inverse. `out` may alias `a`.
 * @param {Float32Array} out
 * @param {Float32Array} a
 * @returns {Float32Array|null} null when the matrix is singular
 */
export function mat4Invert(out, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

/**
 * Transforms a point by a matrix including the perspective divide.
 * @param {Float32Array|number[]} out vec3
 * @param {Float32Array} m
 * @param {ArrayLike<number>} p vec3
 * @returns {Float32Array|number[]}
 */
export function mat4TransformPoint(out, m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}

/**
 * Extracts the 6 normalized frustum planes (a, b, c, d; inside when ax + by + cz + d >= 0).
 * @param {Float32Array} out 24 floats
 * @param {Float32Array} m view-projection matrix
 * @returns {Float32Array}
 */
export function frustumPlanes(out, m) {
  for (let i = 0; i < 6; i++) {
    const row = i >> 1, sign = i & 1 ? -1 : 1;
    const a = m[3] + sign * m[row], b = m[7] + sign * m[4 + row];
    const c = m[11] + sign * m[8 + row], d = m[15] + sign * m[12 + row];
    const l = 1 / hypot3(a, b, c);
    out[i * 4] = a * l; out[i * 4 + 1] = b * l; out[i * 4 + 2] = c * l; out[i * 4 + 3] = d * l;
  }
  return out;
}

/**
 * @param {Float32Array} planes from frustumPlanes
 * @param {number} x sphere center
 * @param {number} y
 * @param {number} z
 * @param {number} r sphere radius
 * @returns {boolean} false when the sphere is completely outside
 */
export function sphereInFrustum(planes, x, y, z, r) {
  for (let i = 0; i < 24; i += 4) {
    if (planes[i] * x + planes[i + 1] * y + planes[i + 2] * z + planes[i + 3] < -r) return false;
  }
  return true;
}

/**
 * Length of a 2D vector. Math.hypot allocates for its variable argument list in hot loops.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function hypot2(a, b) {
  return Math.sqrt(a * a + b * b);
}

/**
 * Length of a 3D vector (allocation-free Math.hypot).
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
export function hypot3(a, b, c) {
  return Math.sqrt(a * a + b * b + c * c);
}
