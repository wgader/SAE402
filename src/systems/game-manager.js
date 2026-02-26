import 'aframe';

/**
 * Game Manager System
 * Handles global game state, money, tutorial states, and UI updates.
 */
AFRAME.registerSystem('game-manager', {
    schema: {},

    init: function () {
        // --- GLOBAL STATE ---
        this.totalEarnings = 0;
        this.totalServed = 0;
        this.gameMode = false;

        // Current order logic
        this.activeCustomer = null;
        this.coffeesOrdered = 0;
        this.coffeesDelivered = 0;
        this.billCollected = false;
        this.customerQueue = [];

        // Tutorial State
        this.tutorialStep = 0;
        this.tutorialUI = null;
        this.tutorialText = null;

        // Shared Lists
        this.spawnedObjects = [];
        this.trashcans = [];
        this.customers = [];
        this.stains = [];

        // Make it accessible globally for legacy functions in main.js
        window.GameManager = this;
    },

    // --- UI UPDATES ---
    updateTutorialUI: function () {
        if (!this.tutorialText) return;

        // GAME MODE
        if (this.gameMode) {
            let msg = 'CAFE OPEN!\n';
            msg += 'Served: ' + this.totalServed + ' | $' + this.totalEarnings + '\n\n';
            if (this.activeCustomer) {
                msg += 'ORDER: ' + this.coffeesOrdered + ' coffee' + (this.coffeesOrdered > 1 ? 's' : '') + '\n';
                for (var i = 0; i < this.coffeesOrdered; i++) {
                    if (i < this.coffeesDelivered) msg += '[x] Coffee ' + (i + 1) + '\n';
                    else if (i === this.coffeesDelivered) msg += '> Make coffee ' + (i + 1) + '\n';
                    else msg += '[  ] Coffee ' + (i + 1) + '\n';
                }
                if (this.coffeesDelivered >= this.coffeesOrdered && !this.billCollected) {
                    msg += '\n> Collect bill -> Register\n';
                } else if (this.billCollected) {
                    msg += '\n[x] Payment done!\n';
                }
            } else {
                msg += 'Waiting for customer...\n';
            }
            msg += '\nQueue: ' + this.customerQueue.length + ' waiting';
            this.tutorialText.setAttribute('value', msg);
            return;
        }

        // TUTORIAL MODE
        let msg = "TO DO:\n\n";

        if (this.tutorialStep === 1) msg += "> Buy Broom & Dustpan (Menu Y)\n  Then clean the floor!\n";
        else if (this.tutorialStep > 1) msg += "[x] Floor cleaned\n";

        if (this.tutorialStep === 2) msg += "> Throw Dustpan in the Trash\n";
        else if (this.tutorialStep > 2) msg += "[x] Cleanup done\n";

        if (this.tutorialStep === 3) msg += "> Place Cash Register (Menu Y)\n";
        else if (this.tutorialStep > 3) msg += "[x] Register placed\n";

        if (this.tutorialStep === 4) msg += "> Place Coffee Machine (Menu Y)\n";
        else if (this.tutorialStep > 4) msg += "[x] Machine placed\n";

        if (this.tutorialStep === 5) msg += "> Serve coffee to customer\n";
        else if (this.tutorialStep > 5) msg += "[x] Customer served\n";

        if (this.tutorialStep === 6) msg += "> Collect the Bill (-> Register)\n";
        else if (this.tutorialStep > 6) msg += "[x] Setup Complete!\n";

        this.tutorialText.setAttribute('value', msg);

        // Tutorial finished -> start game mode
        if (this.tutorialStep === 7) {
            setTimeout(() => {
                if (typeof window.startGameMode === 'function') {
                    window.startGameMode();
                }
            }, 3000);
        }
    },

    createTutorialUI: function () {
        const cam = document.getElementById('cam');
        if (!cam) return;

        const panel = document.createElement('a-entity');
        panel.setAttribute('position', '0.2 0.15 -0.8');
        panel.setAttribute('rotation', '0 -10 0');

        const bg = document.createElement('a-plane');
        bg.setAttribute('width', '0.5');
        bg.setAttribute('height', '0.35');
        bg.setAttribute('color', '#1a1a2e');
        bg.setAttribute('opacity', '0.85');
        bg.setAttribute('side', 'double');
        panel.appendChild(bg);

        const border = document.createElement('a-plane');
        border.setAttribute('width', '0.52');
        border.setAttribute('height', '0.37');
        border.setAttribute('color', '#00FF88');
        border.setAttribute('opacity', '0.3');
        border.setAttribute('position', '0 0 -0.001');
        panel.appendChild(border);

        this.tutorialText = document.createElement('a-text');
        this.tutorialText.setAttribute('value', 'Loading...');
        this.tutorialText.setAttribute('align', 'left');
        this.tutorialText.setAttribute('position', '-0.22 0.1 0.01');
        this.tutorialText.setAttribute('width', '0.8');
        this.tutorialText.setAttribute('color', '#FFFFFF');
        this.tutorialText.setAttribute('font', 'mozillavr');
        panel.appendChild(this.tutorialText);

        cam.appendChild(panel);
        this.tutorialUI = panel;
        this.updateTutorialUI();
    },

    registerSpawnedObject: function (el) {
        this.spawnedObjects.push(el);
        if (el.classList.contains('trashcan')) {
            this.trashcans.push(el);
        }
    }
});
