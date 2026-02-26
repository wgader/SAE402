

/**
 * Draggable Component
 * Manages grabbing and throwing physics for objects picked up by controllers.
 */
AFRAME.registerComponent('draggable', {
    init: function () {
        this.grabbedBy = null; // Controller entity
        this.velocities = [];

        this.el.addEventListener('grabbed', (e) => {
            this.grabbedBy = e.detail.controller;
            this.velocities = [];
        });

        this.el.addEventListener('released', () => {
            this.grabbedBy = null;
            this.applyThrowPhysics();
        });
    },

    tick: function () {
        if (!this.grabbedBy) return;

        // Position sync with controller
        const pos = new THREE.Vector3();
        this.grabbedBy.object3D.getWorldPosition(pos);

        if (isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
            // Apply offset for broom
            if (this.el.getAttribute('gltf-model') && this.el.getAttribute('gltf-model').includes('Broom')) {
                const updatedPos = pos.clone().add(new THREE.Vector3(0, -0.6, 0));
                this.el.object3D.position.copy(updatedPos);
            } else {
                this.el.object3D.position.set(pos.x, pos.y, pos.z);
            }

            if (this.el.body) {
                const p = this.el.object3D.position;
                this.el.body.position.set(p.x, p.y, p.z);
            }

            this.velocities.push({ x: pos.x, y: pos.y, z: pos.z, t: performance.now() });
            if (this.velocities.length > 10) this.velocities.shift();
        }
    },

    applyThrowPhysics: function () {
        if (this.velocities.length < 2) return;
        const v1 = this.velocities[0];
        const v2 = this.velocities[this.velocities.length - 1];
        const dt = (v2.t - v1.t) / 1000;
        if (dt <= 0.001) return;

        const throwVx = (v2.x - v1.x) / dt;
        const throwVy = (v2.y - v1.y) / dt;
        const throwVz = (v2.z - v1.z) / dt;

        if (this.el.body) {
            this.el.body.velocity.set(throwVx * 1.5, throwVy * 1.5, throwVz * 1.5);
        }
        this.velocities = [];
    }
});
