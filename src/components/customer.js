

/**
 * Customer AI Component
 * Handles the logic, patience timers, and animations for individual customers.
 */
AFRAME.registerComponent('customer-ai', {
    schema: {
        spawnIndex: { type: 'number', default: 0 }
    },

    init: function () {
        this.patienceTimer = null;
        this.status = 'queue';
        this.orderedCoffees = Math.floor(Math.random() * 3) + 1;

        // Listen for delivery events emitted by main.js raycaster/collision
        this.el.addEventListener('receive-coffee', (e) => {
            this.handleCoffeeDelivery(e.detail.cup);
        });
    },

    startPatience: function () {
        const PATIENCE_MIN = 15000;
        const PATIENCE_MAX = 25000;
        const duration = Math.floor(Math.random() * (PATIENCE_MAX - PATIENCE_MIN + 1)) + PATIENCE_MIN;

        this.patienceTimer = setTimeout(() => {
            this.leaveAngry();
        }, duration);
    },

    stopPatience: function () {
        if (this.patienceTimer) {
            clearTimeout(this.patienceTimer);
            this.patienceTimer = null;
        }
    },

    handleCoffeeDelivery: function (cupEl) {
        // Stop patience while updating order
        this.stopPatience();
        // Custom logic to update the order count and visuals
    },

    leaveAngry: function () {
        this.status = 'leaving';
        console.log('Customer leaving angry!');

        // Emote anger
        const decal = document.createElement('a-plane');
        decal.setAttribute('material', 'src: url(public/models/decor/angry.png); transparent: true');
        decal.setAttribute('position', '0 1.5 0');
        this.el.appendChild(decal);

        // Tell Game Manager about penalty
        if (window.GameManager) {
            window.GameManager.totalEarnings = Math.max(0, window.GameManager.totalEarnings - 5);
        }

        setTimeout(() => {
            this.removeCustomer();
        }, 2000);
    },

    removeCustomer: function () {
        if (this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
});
