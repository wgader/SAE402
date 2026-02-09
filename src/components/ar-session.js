/* global AFRAME, THREE */

/**
 * AR Session Manager - Gère le démarrage de la session AR et les controllers
 */
AFRAME.registerComponent('ar-session', {
    schema: {
        grabDistance: { type: 'number', default: 0.5 },
        throwMultiplier: { type: 'number', default: 1 }
    },

    init: function () {
        this.debugLog = document.getElementById('debug-log');
        this.startBtn = document.getElementById('start-btn');
        this.cube = document.getElementById('the-cube');

        this.xrSession = null;
        this.isGrabbing = false;
        this.activeController = null;
        this.cubeOriginalParent = null;
        this.previousPositions = [];
        this.maxPositionHistory = 5;
        this.trackingInterval = null;

        // Bind methods
        this.onStartClick = this.onStartClick.bind(this);
        this.grab = this.grab.bind(this);
        this.release = this.release.bind(this);

        // Setup button listener
        if (this.startBtn) {
            this.startBtn.addEventListener('click', this.onStartClick);
        }
    },

    log: function (message) {
        if (this.debugLog) {
            this.debugLog.textContent = message;
        }
        console.log('[AR Session]', message);
    },

    onStartClick: async function () {
        this.log('Lancement AR...');

        if (!navigator.xr) {
            this.log('WebXR non disponible!');
            return;
        }

        try {
            this.xrSession = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['hand-tracking', 'dom-overlay', 'plane-detection'],
                domOverlay: { root: document.getElementById('overlay') }
            });

            this.el.sceneEl.renderer.xr.setSession(this.xrSession);
            this.startBtn.style.display = 'none';

            // Sauvegarder le parent original du cube
            this.cubeOriginalParent = this.cube.object3D.parent;

            // Setup controllers
            this.setupControllers();

            this.log('AR OK!');

        } catch (e) {
            this.log('Erreur: ' + e.message);
            console.error(e);
        }
    },

    setupControllers: function () {
        const renderer = this.el.sceneEl.renderer;
        const controller0 = renderer.xr.getController(0);
        const controller1 = renderer.xr.getController(1);

        this.el.sceneEl.object3D.add(controller0);
        this.el.sceneEl.object3D.add(controller1);

        // Controller 0 events
        controller0.addEventListener('selectstart', () => {
            if (!this.isGrabbing) this.grab(controller0);
        });
        controller0.addEventListener('selectend', this.release);
        controller0.addEventListener('squeezestart', () => {
            if (!this.isGrabbing) this.grab(controller0);
        });
        controller0.addEventListener('squeezeend', this.release);

        // Controller 1 events
        controller1.addEventListener('selectstart', () => {
            if (!this.isGrabbing) this.grab(controller1);
        });
        controller1.addEventListener('selectend', this.release);
        controller1.addEventListener('squeezestart', () => {
            if (!this.isGrabbing) this.grab(controller1);
        });
        controller1.addEventListener('squeezeend', this.release);
    },

    grab: function (controller) {
        // Vérifier la distance
        const ctrlPos = new THREE.Vector3();
        controller.getWorldPosition(ctrlPos);

        const cubePos = new THREE.Vector3();
        this.cube.object3D.getWorldPosition(cubePos);

        const distance = ctrlPos.distanceTo(cubePos);

        if (distance > this.data.grabDistance) return;

        this.isGrabbing = true;
        this.activeController = controller;
        this.previousPositions = [];

        // Couleur jaune
        this.cube.setAttribute('material', 'color', '#FFD700');

        // Désactiver la physique
        if (this.cube.body) {
            this.cube.body.mass = 0;
            this.cube.body.type = 2; // KINEMATIC
            this.cube.body.updateMassProperties();
        }

        // Parenter le cube au controller
        this.cube.object3D.parent.remove(this.cube.object3D);
        controller.add(this.cube.object3D);

        this.cube.object3D.position.set(0, 0, 0);
        this.cube.object3D.quaternion.set(0, 0, 0, 1);

        // Démarrer le suivi de vélocité
        this.startTracking();

        this.log('ATTRAPÉ!');
    },

    startTracking: function () {
        if (this.trackingInterval) clearInterval(this.trackingInterval);
        this.previousPositions = [];

        this.trackingInterval = setInterval(() => {
            if (!this.isGrabbing || !this.activeController) {
                clearInterval(this.trackingInterval);
                return;
            }

            const pos = new THREE.Vector3();
            this.activeController.getWorldPosition(pos);

            this.previousPositions.push({
                pos: pos.clone(),
                time: performance.now()
            });

            if (this.previousPositions.length > this.maxPositionHistory) {
                this.previousPositions.shift();
            }
        }, 16);
    },

    calculateVelocity: function () {
        if (this.previousPositions.length < 2) {
            return new THREE.Vector3(0, 0, 0);
        }

        const last = this.previousPositions[this.previousPositions.length - 1];
        const first = this.previousPositions[Math.max(0, this.previousPositions.length - 3)];

        const dt = (last.time - first.time) / 1000;
        if (dt <= 0) return new THREE.Vector3(0, 0, 0);

        const velocity = new THREE.Vector3();
        velocity.x = (last.pos.x - first.pos.x) / dt;
        velocity.y = (last.pos.y - first.pos.y) / dt;
        velocity.z = (last.pos.z - first.pos.z) / dt;

        return velocity;
    },

    release: function () {
        if (!this.isGrabbing) return;

        // Calculer la vélocité
        const throwVelocity = this.calculateVelocity();

        // Sauvegarder la position mondiale
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        this.cube.object3D.getWorldPosition(worldPos);
        this.cube.object3D.getWorldQuaternion(worldQuat);

        // Remettre dans la scène
        this.activeController.remove(this.cube.object3D);
        this.cubeOriginalParent.add(this.cube.object3D);

        this.cube.object3D.position.copy(worldPos);
        this.cube.object3D.quaternion.copy(worldQuat);

        // Couleur violette
        this.cube.setAttribute('material', 'color', '#8A2BE2');

        // Réactiver la physique avec la vélocité du lancer
        if (this.cube.body) {
            this.cube.body.position.set(worldPos.x, worldPos.y, worldPos.z);
            this.cube.body.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
            this.cube.body.type = 1; // DYNAMIC
            this.cube.body.mass = 1;
            this.cube.body.updateMassProperties();

            // Appliquer la vélocité du lancer
            this.cube.body.velocity.set(
                throwVelocity.x * this.data.throwMultiplier,
                throwVelocity.y * this.data.throwMultiplier,
                throwVelocity.z * this.data.throwMultiplier
            );

            // Rotation pour le réalisme
            this.cube.body.angularVelocity.set(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 3
            );

            this.cube.body.wakeUp();
        }

        this.isGrabbing = false;
        this.activeController = null;

        this.log(`Lancé! V: ${throwVelocity.x.toFixed(1)}, ${throwVelocity.y.toFixed(1)}, ${throwVelocity.z.toFixed(1)}`);
    },

    remove: function () {
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
        }
        if (this.startBtn) {
            this.startBtn.removeEventListener('click', this.onStartClick);
        }
    }
});
