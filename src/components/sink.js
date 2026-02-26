

AFRAME.registerComponent('sink', {
    init: function () {
        this.locked = false;

        this.el.addEventListener('interact', () => {
            if (this.locked) return;
            this.locked = true;

            console.log('🥤 Sink activated!');
            const debugEl = document.getElementById('debug');
            if (debugEl) debugEl.textContent = '🥤 Filling glass...';

            setTimeout(() => {
                this.spawnGlass();
                this.locked = false;
            }, 200);
        });
    },

    spawnGlass: function () {
        const sinkPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(sinkPos);

        const glassPos = {
            x: sinkPos.x - 0.2, // Offset to center better if origin is side-based
            y: sinkPos.y + 0.7, // Higher spawn to come from "above"
            z: sinkPos.z
        };

        const glass = document.createElement('a-entity');
        glass.setAttribute('gltf-model', 'url(models/Cup.glb)');
        glass.setAttribute('scale', '0.6 0.6 0.6');
        glass.setAttribute('position', `${glassPos.x} ${glassPos.y} ${glassPos.z}`);
        glass.setAttribute('dynamic-body', 'mass:0.3;linearDamping:0.5;angularDamping:0.5');
        glass.setAttribute('class', 'clickable grabbable water-glass');
        glass.id = `glass-${Date.now()}`;
        glass.dataset.isWater = 'true';

        // Blue water indicator inside the cup
        var waterMark = document.createElement('a-sphere');
        waterMark.setAttribute('radius', '0.08');
        waterMark.setAttribute('color', '#74b9ff');
        waterMark.setAttribute('opacity', '0.8');
        waterMark.setAttribute('position', '0 0.08 0');
        glass.appendChild(waterMark);

        // Add collision listener for delivery (Customer delivery detection)
        glass.addEventListener('collide', (e) => {
            const collidedEl = e.detail.body.el;
            if (!collidedEl) return;

            if (collidedEl.classList.contains('customer')) {
                console.log('🥤 WATER HIT CUSTOMER!');
                if (typeof window.deliverCoffee === 'function') {
                    window.deliverCoffee(collidedEl, glass);
                }
            }
        });

        this.el.sceneEl.appendChild(glass);

        // Notify main.js to track it for raycasting/trashcan
        if (typeof window.registerSpawnedObject === 'function') {
            window.registerSpawnedObject(glass);
        }

        const debugEl = document.getElementById('debug');
        if (debugEl) debugEl.textContent = '🥤 Water ready!';
    }
});
