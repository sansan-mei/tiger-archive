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
    const delta = new T.Quaternion(), axis = new T.Vector3();
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
      const stride = alive ? Math.min(1, Math.abs(speed) / 4) : 0;
      for (const [side, phase] of [['L', 0], ['R', Math.PI]]) {
        const swing = Math.sin(travel * 2.2 + phase) * stride;
        pose('足D' + side, 0, 0, swing * .42);
        pose('ひざD' + side, 0, 0, Math.max(0, -swing) * .55);
        pose('足首D' + side, 0, 0, -swing * .12);
      }
      // Limit spinal twist when strafing or aiming behind the body.
      pose('上半身', 0, alive ? Math.max(-.8, Math.min(.8, aim)) : 0,
        alive ? -pitch * .2 + recoil * .07 : 0);
      pose('上半身2', 0, 0, alive ? -pitch * .15 : 0);
      for (const side of ['L', 'R']) {
        pose('腕' + side, side === 'L' ? -.2 : .2, 0, alive ? -.22 - recoil * .12 : 0);
        pose('ひじ' + side, 0, 0, alive ? -.3 - pitch * .15 : 0);
      }
      for (let i = 0; i < 10; i++)
        pose(`PF_${i}_0`, 0, 0, alive ? Math.sin(time * 2 + i * .5) * .025 + stride * .08 : 0);
    };
    ctx.disposeCharacter = () => { for (const skeleton of skeletons) skeleton.dispose(); };
    ctx.animateCharacter();
  },
};
