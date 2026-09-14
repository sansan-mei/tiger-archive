/* Pose the imported weighted bones without relying on MMD runtime constraints. */
window.TankPaimonRig = {
  attach(ctx, root) {
    const T = ctx.T, joints = new Map(), skeletons = new Set();
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (o.isSkinnedMesh) skeletons.add(o.skeleton);
      if (!o.isBone) return;
      joints.set(o.name, {bone: o, rest: o.quaternion.clone(),
        parentRest: o.parent.getWorldQuaternion(new T.Quaternion()).invert()});
    });
    // The shared human gun mount sits at shoulder height (1.24 world units).
    const grips = {};
    for (const side of ['R', 'L']) {
      const grip = new T.Object3D();
      grip.name = `hand-grip-${side}`;
      // Pistol hands wrap the rear grip; other weapons use a forward support hand.
      grip.position.fromArray(side === 'R' ? [-.10, -.15, 0] :
        ctx.weaponType === 'pistol' ? [-.10, -.13, .18] : [-.18, -.10, .20]);
      ctx.gun.add(grip);
      grips[side] = grip;
    }
    const delta = new T.Quaternion(), axis = new T.Vector3();
    const shoulder = new T.Vector3(), elbow = new T.Vector3(), wrist = new T.Vector3();
    const target = new T.Vector3(), direction = new T.Vector3(), bend = new T.Vector3();
    const desiredElbow = new T.Vector3(), from = new T.Vector3(), to = new T.Vector3();
    const parentRotation = new T.Quaternion(), rotation = new T.Quaternion();
    function pointBone(bone, end, destination) {
      bone.getWorldPosition(from);
      end.getWorldPosition(to).sub(from).normalize();
      from.subVectors(destination, from).normalize();
      rotation.setFromUnitVectors(to, from);
      bone.parent.getWorldQuaternion(parentRotation);
      delta.copy(parentRotation).invert().multiply(rotation).multiply(parentRotation);
      bone.quaternion.premultiply(delta).normalize();
      bone.updateWorldMatrix(false, true);
    }
    function hold(side) {
      const upper = joints.get('腕' + side).bone;
      const lower = joints.get('ひじ' + side).bone;
      const hand = joints.get('手首' + side).bone;
      upper.getWorldPosition(shoulder);
      lower.getWorldPosition(elbow);
      hand.getWorldPosition(wrist);
      grips[side].getWorldPosition(target);
      const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
      direction.subVectors(target, shoulder);
      const distance = Math.max(.0001, direction.length());
      const reach = Math.min(a + b - .00001, Math.max(Math.abs(a - b) + .00001, distance));
      direction.divideScalar(distance);
      // Stable elbow pole points down and out from the torso, including on ramps.
      bend.set(.12, -1, side === 'R' ? -.45 : .45)
        .applyQuaternion(ctx.tank.getWorldQuaternion(parentRotation));
      bend.addScaledVector(direction, -bend.dot(direction)).normalize();
      const along = (a * a - b * b + reach * reach) / (2 * reach);
      desiredElbow.copy(shoulder).addScaledVector(direction, along)
        .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
      pointBone(upper, lower, desiredElbow);
      pointBone(lower, hand, target);
      // Match the palm to the weapon, keeping the imported wrist's local rest frame.
      hand.parent.getWorldQuaternion(parentRotation);
      ctx.gun.getWorldQuaternion(rotation);
      hand.quaternion.copy(parentRotation).invert().multiply(rotation)
        .multiply(joints.get('手首' + side).palm);
      hand.updateWorldMatrix(false, true);
      // Close the fingers around the grip instead of leaving the MMD open hand.
      for (const finger of ['中指', '人指', '薬指', '小指'])
        for (const [part, curl] of [['１', .25], ['２', .9], ['３', .6]]) {
          const joint = joints.get(finger + part + side);
          if (!joint) continue;
          joint.bone.parent.getWorldQuaternion(parentRotation);
          ctx.gun.getWorldQuaternion(rotation);
          axis.set(0, 0, 1).applyQuaternion(rotation)
            .applyQuaternion(parentRotation.invert());
          joint.bone.quaternion.copy(joint.rest)
            .premultiply(delta.setFromAxisAngle(axis, -curl));
          joint.bone.updateWorldMatrix(false, true);
        }
    }
    for (const side of ['R', 'L']) {
      const joint = joints.get('手首' + side);
      joint.palm = joint.bone.getWorldQuaternion(new T.Quaternion());
      joint.bone.getWorldPosition(from);
      joints.get('中指１' + side).bone.getWorldPosition(to);
      from.subVectors(to, from).normalize();
      rotation.setFromUnitVectors(from, new T.Vector3(0, -1, 0));
      joint.palm.premultiply(rotation);
    }
    function pose(name, x, y = 0, z = 0) {
      const joint = joints.get(name);
      if (!joint) return;
      joint.bone.quaternion.copy(joint.rest);
      // Axes are game-local: Z swings the legs along the forward (-X) direction.
      for (const [angle, vector] of [[x, [1, 0, 0]], [y, [0, 1, 0]], [z, [0, 0, 1]]]) {
        if (!angle) continue;
        axis.fromArray(vector).applyQuaternion(joint.parentRest);
        joint.bone.quaternion.premultiply(delta.setFromAxisAngle(axis, angle));
      }
    }
    ctx.animateCharacter = ({travel = 0, speed = 0, aim = 0, pitch = 0,
      recoil = 0, alive = true, time = 0} = {}) => {
      // Facing the aim keeps both shoulders within reach even when moving backwards.
      root.rotation.y = -Math.PI / 2 + aim;
      const stride = alive ? Math.min(1, Math.abs(speed) / 4) : 0;
      for (const [side, phase] of [['L', 0], ['R', Math.PI]]) {
        const swing = Math.sin(travel * 2.2 + phase) * stride;
        pose('足D' + side, 0, 0, swing * .42);
        pose('ひざD' + side, 0, 0, Math.max(0, -swing) * .55);
        pose('足首D' + side, 0, 0, -swing * .12);
      }
      // Small chest response adds recoil without twisting the spine through 180 degrees.
      pose('上半身', 0, 0,
        alive ? -pitch * .2 + recoil * .07 : 0);
      pose('上半身2', 0, 0, alive ? -pitch * .15 : 0);
      for (const side of ['L', 'R']) {
        pose('腕' + side, 0);
        pose('ひじ' + side, 0);
        pose('手首' + side, 0);
      }
      for (let i = 0; i < 10; i++)
        pose(`PF_${i}_0`, 0, 0, alive ? Math.sin(time * 2 + i * .5) * .025 + stride * .08 : 0);
      ctx.tank.updateWorldMatrix(true, true);
      if (alive) for (const side of ['R', 'L']) hold(side);
    };
    ctx.disposeCharacter = () => { for (const skeleton of skeletons) skeleton.dispose(); };
  },
};
