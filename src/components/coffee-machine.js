

AFRAME.registerComponent('coffee-machine', {
    init: function () {
        this.locked = false;
        // The audio was globally initialized in main.js, now encapsulated.
        this.audio = new Audio('/sounds/public_assets_café.MP3');
        this.audio.volume = 0.7;

        this.el.addEventListener('interact', () => {
            if (this.locked) return;
            this.locked = true;

            console.log('☕ Machine à café activée!');
            const debugEl = document.getElementById('debug');
            if (debugEl) debugEl.textContent = '☕ Préparation du café...';

            this.audio.currentTime = 0;
            this.audio.play().catch(e => console.log('Audio error:', e));

            setTimeout(() => {
                this.spawnCup();
                this.locked = false;
            }, 200);
        });
    },

    spawnCup: function () {
        const machinePos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(machinePos);

        const cupPos = {
            x: machinePos.x + 0.15,
            y: machinePos.y + 0.05,
            z: machinePos.z
        };

        const cup = document.createElement('a-entity');
        cup.setAttribute('gltf-model', 'url(models/Coffeecup.glb)');
        cup.setAttribute('scale', '0.14 0.14 0.14');
        cup.setAttribute('position', `${cupPos.x} ${cupPos.y} ${cupPos.z}`);
        cup.setAttribute('dynamic-body', 'mass:0.3;linearDamping:0.5;angularDamping:0.5');
        cup.setAttribute('class', 'clickable grabbable coffee-cup');
        cup.id = `coffee-cup-${Date.now()}`;
        cup.dataset.isCoffee = 'true';

        // Add collision listener for delivery (Customer delivery detection)
        cup.addEventListener('collide', (e) => {
            const collidedEl = e.detail.body.el;
            if (!collidedEl) return;

            if (collidedEl.classList.contains('customer')) {
                console.log('☕ CUP HIT CUSTOMER!');
                if (typeof window.deliverCoffee === 'function') {
                    window.deliverCoffee(collidedEl, cup);
                }
            }
        });

        this.el.sceneEl.appendChild(cup);

        // Notify main.js to track it for raycasting/trashcan
        if (typeof window.registerSpawnedObject === 'function') {
            window.registerSpawnedObject(cup);
        }

        const debugEl = document.getElementById('debug');
        if (debugEl) debugEl.textContent = '☕ Café prêt!';
    }
});
