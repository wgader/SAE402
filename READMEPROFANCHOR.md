# WebXR + A-Frame - Exemples de Réalité Augmentée et Virtuelle

Collection d'exemples WebXR et A-Frame pour apprendre à créer des expériences de réalité virtuelle et augmentée dans le navigateur.

## 🚀 Démarrage rapide

### Tester sur Quest 3

1. Assurez-vous que votre Quest 3 et votre ordinateur sont sur le même réseau
2. Lancez le serveur : `python3 server.py`
3. Récupérez l'adresse IP locale affichée dans le terminal
4. Dans le Quest 3, ouvrez le navigateur et allez sur `https://[votre-ip]:8000`
5. Acceptez l'exception de certificat

## 📚 Contenu

### AR Basics - Exemples WebXR natifs

Ces exemples utilisent l'API WebXR pure avec Three.js :

- **Anchors** - Placer des objets virtuels avec des points d'ancrage stables
- **Hit Test** - Détecter les surfaces réelles pour y placer des objets
- **Hit Test with Anchors** - Combiner détection de surfaces et ancrage

### A-Frame Examples - Exemples avec A-Frame

A-Frame est un framework déclaratif qui simplifie la création d'expériences WebXR :

1. **Example 1 - Basic Primitives** 
   - Introduction aux primitives A-Frame (box, sphere, cylinder, plane)
   - Scène VR simple avec objets de base

2. **Example 2 - Ocean Scene**
   - Utilisation de composants communautaires
   - Système de particules (pluie)
   - Océan animé et ciel dynamique

3. **Example 3 - VR Interactions**
   - Interactions avec les contrôleurs Quest 3
   - Raycasting pour sélectionner des objets
   - Changement de couleur au clic

4. **Example 4 - Animations**
   - Animations de position et rotation
   - Création dynamique d'objets avec JavaScript
   - Manipulation du DOM A-Frame

5. **AR Anchors (Quest 3 Optimized)** ⭐
   - Placement d'objets 3D en réalité augmentée
   - Utilisation de l'API WebXR Anchors
   - Détection de surfaces avec Hit Test
   - [📖 Documentation technique complète](readme-viewer.html)

## 🛠️ Technologies

- **WebXR API** - API native du navigateur pour VR/AR
- **A-Frame 1.7.1** - Framework déclaratif pour WebXR
- **Three.js** - Bibliothèque 3D (utilisée en interne par A-Frame)
- **Python** - Serveur HTTPS local pour le développement

## 📱 Compatibilité

### Testé sur :
- ✅ Meta Quest 3 (navigateur natif)

### Fonctionnalités supportées :
- **VR immersive** : Tous les exemples A-Frame
- **AR immersive** : Exemples AR Basics + AR Anchors Quest 3
- **Hit Test** : Détection de surfaces réelles
- **Anchors** : Points d'ancrage stables dans l'espace

## 📂 Structure du projet

```
WebXR-A-Frame/
├── index.html                    # Page d'accueil avec liste des exemples
├── server.py                     # Serveur HTTPS local
├── cert.pem / key.pem           # Certificats SSL auto-signés
├── README.md                     # Ce fichier
├── README-AR-ANCHORS.md         # Documentation technique AR Anchors
├── readme-viewer.html           # Visualiseur de documentation
│
├── ex1/ à ex4/                  # Exemples A-Frame progressifs
│   └── index.html
│
├── anchors.html                 # Exemple AR Anchors (WebXR pur)
├── hit-test.html                # Exemple Hit Test (WebXR pur)
├── hit-test-anchors.html        # Exemple Hit Test + Anchors
├── anchors-aframe-quest3.html   # AR Anchors avec A-Frame
│
├── js/                          # Bibliothèques JavaScript
│   ├── render/                  # Moteur de rendu Three.js
│   ├── util/                    # Utilitaires WebXR
│   └── third-party/             # Dépendances externes
│
├── media/                       # Assets 3D et textures
│   ├── gltf/                    # Modèles 3D (sunflower, reticle, space)
│   ├── textures/                # Images et textures
│   └── logo/                    # Logo WebXR
│
└── css/                         # Styles CSS
    ├── common.css
    └── stylesheet.css
```

## 🔧 Développement

### Ajouter un nouvel exemple

1. Créez un fichier HTML dans le dossier racine ou dans un sous-dossier `exN/`
2. Ajoutez-le dans `index.html` dans le tableau `pages` :

```javascript
{ title: 'Mon Exemple', category: 'A-Frame Examples',
  path: 'mon-exemple.html',
  description: 'Description de mon exemple'},
```

### Déboguer en AR

Les exemples incluent des overlays de débogage :
- Compteur d'objets placés
- Messages de statut
- Indicateurs visuels (curseur coloré)

Vérifiez la console du navigateur pour les logs détaillés.

## 📖 Documentation

- [Documentation technique AR Anchors](readme-viewer.html) - Guide complet avec exemples de code
- [A-Frame Documentation](https://aframe.io/docs/) - Documentation officielle A-Frame
- [WebXR Device API](https://www.w3.org/TR/webxr/) - Spécification WebXR

## 🎓 Ressources d'apprentissage

- **A-Frame School** : https://aframe.io/aframe-school/
- **WebXR Samples** : https://immersive-web.github.io/webxr-samples/
- **Three.js Fundamentals** : https://threejs.org/manual/

## 🐛 Problèmes connus

- **Certificat SSL** : Nécessite d'accepter manuellement l'exception dans le navigateur
- **Hit Test instable** : Bougez lentement pour de meilleurs résultats de détection
- **Quest 2** : Anchors peuvent être moins stables que sur Quest 3

## 📝 Licence

Basé sur [webxr-samples](https://github.com/immersive-web/webxr-samples) sous licence MIT.

## 👨‍💻 Auteur

Benoit Crespin - SAE 4.DWeb-DI.02 - 2026