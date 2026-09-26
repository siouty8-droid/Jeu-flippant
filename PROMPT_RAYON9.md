# Prompt — RAYON 9 (jeu d'horreur Babylon.js)

> Copie tout ce qui suit dans ton agent de code (Claude Code ou autre). Il est écrit pour être lu par une IA qui part d'un repo vide.

---

## Rôle et objectif

Tu es un développeur de jeux web senior, spécialisé en Babylon.js et en design d'horreur psychologique. Tu vas construire **RAYON 9**, un jeu d'horreur à la première personne jouable dans le navigateur, dans ce repo (actuellement vide).

Le jeu doit faire peur **sans monstre visible et sans jumpscare**. La peur vient de trois choses :
1. **L'espace ment** : le supermarché se réorganise quand tu ne regardes pas.
2. **L'information arrive en retard** : les caméras de surveillance montrent le passé.
3. **La menace est dangereuse quand elle s'arrête**, pas quand elle attaque.

Chaque décision technique doit servir ces trois piliers. Si une feature ne les sert pas, elle passe après.

---

## Pitch

*Supermarché « Bellevue », ouvert 24h/24, nuit du 30 au 31 octobre.*

Le joueur incarne **Farid**, 22 ans, vigile de nuit depuis trois semaines. À 1h05, sa collègue **Sabine** (la caissière de nuit, seule autre employée présente) se retrouve enfermée dans la **chambre froide**, verrouillée de l'extérieur par un verrou qui n'existe pas normalement. Farid doit la libérer avant qu'elle meure d'hypothermie, puis la porter jusqu'à la sortie avant 6h. Mais passé minuit, le magasin obéit à d'autres règles.

---

## Stack technique (imposée)

- **Vite + TypeScript** (mode strict), **Babylon.js** (`@babylonjs/core`, `@babylonjs/gui`), pas d'autre moteur.
- **Aucun asset externe obligatoire** pour les premières étapes : géométrie procédurale (boxes, planes, `MeshBuilder`), textures via `DynamicTexture`, sons et musique générés avec la **Web Audio API**. Les vrais assets (modèles, voix) pourront remplacer les placeholders plus tard sans toucher à la logique.
- Contrôles FPS : `UniversalCamera` + pointer lock. `ZQSD`/`WASD` (détecter la disposition ou laisser le choix), `Shift` = courir, `E` = interagir, `Tab` = plan d'évacuation, `T` = talkie (push-to-talk / lire les messages), `Échap` = pause.
- Cible **60 fps** sur un laptop moyen. Pas plus de 4 à 6 `PointLight` actives en même temps : le reste des néons en matériaux émissifs.
- `npm run dev` doit lancer le jeu, `npm run build` doit passer sans erreur ni warning TypeScript.

### Architecture de code attendue

```
src/
  main.ts                 // bootstrap, boucle, états de jeu (menu, jeu, pause, fin)
  core/
    GameClock.ts          // heure in-game (00:00 → 06:00), vitesse configurable
    EventBus.ts           // événements typés entre systèmes
    Rng.ts                // PRNG seedé (mulberry32 ou équivalent)
    Debug.ts              // overlay debug (F1)
  world/
    StoreLayout.ts        // grille logique du magasin, modules, graphe de connexions
    ModuleFactory.ts      // construction 3D des modules (rayons, allées, réserve…)
    ReshuffleSystem.ts    // règle 1 : réagencement hors champ
    Doors.ts              // portes, clés, verrous, règle 5
  systems/
    DwellTracker.ts       // temps passé par zone + immobilité du joueur
    NeonSystem.ts         // règle 3
    SecurityCameras.ts    // règle 2 : enregistrement + replay différé
    ShopperAI.ts          // règle 4 : le client au caddie
    NoiseSystem.ts        // bruit du joueur (course, objets)
    StoreRadio.ts         // musique d'ambiance, 8 morceaux + morceaux « inconnus »
  narrative/
    Timeline.ts           // événements scriptés par heure
    Sabine.ts             // état (température, lampe, lucidité) + dialogues
    Dialogues.ts          // toutes les répliques, en français
    Endings.ts            // fins normale, mauvaises, cachée
  player/
    PlayerController.ts   // déplacement, course, portage de Sabine
    Inventory.ts          // trousseau, double de clé, badge…
  ui/
    Hud.ts                // montre de vigile, sous-titres talkie, prompts d'interaction
    EvacuationPlan.ts     // plan 2D du magasin « d'avant minuit »
    CameraMonitor.ts      // écrans du poste de sécurité
```

Tous les réglages de gameplay (seuils, durées, vitesses) dans un seul fichier `src/config.ts` pour pouvoir équilibrer sans fouiller le code.

---

## Le lieu

Supermarché de taille moyenne, lisible : **9 rayons** + zones fixes.

| Zone | Contenu | Note |
|---|---|---|
| Entrée / caisses | 3 caisses, portiques antivol, **plan d'évacuation** affiché au mur | Le point d'entrée du joueur = la sortie qui reste toujours ouverte |
| Poste de sécurité | Bureau, 4 à 6 écrans de surveillance | Petit local près de l'entrée |
| Rayon 1 | Fruits et légumes | |
| Rayon 2 | Boulangerie / viennoiseries | |
| Rayon 3 | Conserves | Lieu de la première rencontre avec le client |
| Rayon 4 | Épicerie / céréales | |
| Rayon 5 | Surgelés | Bacs lumineux, bourdonnement froid |
| Rayon 6 | Boucherie | Caisse enregistreuse fermée (contient le double de clé) |
| Rayon 7 | Produits ménagers | |
| Rayon 8 | Boissons | |
| Rayon 9 | *N'apparaît pas sur le plan d'évacuation.* | Apparaît seulement après 2h30, change de place à chaque fois. Dernier rayon avant la réserve dans la phase finale |
| Réserve | Fond du magasin, palettes, transpalette | |
| Chambre froide | À côté de la réserve | Sabine est dedans |
| Local technique | Mitoyen de la chambre froide | Bruits de pas en boucle ; contient la pile de badges (fin cachée) |
| Portes de secours | 3 portes (côté boissons, côté réserve, côté boulangerie) | Règle 5 |

Ambiance visuelle : néons blancs un peu trop froids, carrelage brillant qui reflète les lumières, étiquettes de prix, affiches promo Halloween, brouillard très léger (`scene.fogMode`), grain + légère aberration chromatique en post-process. Rien de gore.

---

## Les 5 règles (le joueur les découvre en jouant, jamais expliquées par un tuto)

### Règle 1 — Les rayons ne sont plus fixes
- Le magasin est une **grille de modules** (un module = un segment d'allée avec ses deux étagères). `StoreLayout` garde un graphe logique (quels modules sont connectés) séparé de la scène 3D.
- **Un réagencement n'arrive jamais sous les yeux du joueur.** Il se déclenche seulement quand le joueur quitte une zone et y revient **par un autre chemin** (suivre l'arête d'entrée/sortie dans le graphe). On swap uniquement des modules qui sont hors du frustum de la caméra ET masqués par un occluder (tester avec des raycasts, pas juste le frustum).
- Probabilité de déplacement d'un rayon = inversement proportionnelle au **temps cumulé** que le joueur y a passé (« ancrage »). Les rayons qu'on connaît bien restent plus stables.
- Le réagencement est seedé (`Rng`) : même seed + mêmes actions = même magasin. Indispensable pour débugger.
- La zone d'entrée, le poste de sécurité et le plan d'évacuation ne bougent **jamais**.

### Règle 2 — Les caméras montrent le passé
- **Ne pas faire un vrai buffer vidéo** (trop lourd). À la place : enregistrer toutes les ~0,2 s un **snapshot d'état** (positions/rotations du joueur, du client, du caddie, état des portes, état des néons, agencement des modules) dans un ring buffer.
- Les écrans du poste de sécurité rendent une **scène de replay** (ou des `RenderTargetTexture` sur des caméras fixes) où les entités sont placées selon le snapshot d'il y a *N* minutes.
- Le décalage n'est pas constant : il varie entre **2 et 4 minutes de jeu** selon l'heure. Chaque écran affiche un **horodatage incrusté** (style caméra de surveillance), donc le joueur qui compare avec sa montre peut calculer le décalage. Rien ne lui dit qu'il doit le faire.
- Le replay peut contenir des **événements injectés** qui n'ont jamais eu lieu en direct (utilisé pour la fin cachée, cf. plus bas).
- Rendu des écrans : noir et blanc légèrement vert, scanlines, bruit, basse résolution.

### Règle 3 — Les néons disent si tu es en sécurité
- Chaque segment d'allée a sa rangée de néons. États : **blanc stable** (rien), **clignotement** (quelque chose s'approche de l'allée), **orange** (quelque chose est **déjà** dans l'allée avec toi, même si tu ne vois rien).
- La logique regarde la présence du client (et d'éventuelles « présences » invisibles scriptées) dans le même module ou le module adjacent.
- Seuls les néons proches du joueur ont une vraie `PointLight` ; les autres sont des matériaux émissifs dont on change la couleur/intensité.
- Le clignotement doit avoir un son : grésillement électrique spatialisé.

### Règle 4 — L'autre client
- Une seule entité, `ShopperAI`, avec son caddie. Machine à états :
  - **SHOPPING** : pousse son caddie de rayon en rayon, s'arrête brièvement devant des étagères, prend des produits. Son de roulettes sur le carrelage, spatialisé, toujours audible de loin. **Tant qu'il roule, il est inoffensif.**
  - **STOPPED** : le caddie s'immobilise au milieu d'une allée. Silence total des roulettes. Les néons de la zone passent à l'orange. Le joueur doit reculer **lentement** et changer de chemin.
  - **HUNTING** : déclenché si le joueur fait du bruit (course, objet renversé) pendant que le client est en STOPPED à portée. Les roulettes reprennent, **dans la direction du joueur**, de plus en plus vite.
  - **CAUGHT** : si le client rattrape le joueur → pas d'animation d'attaque. L'écran fond au noir, la musique d'ambiance reprend normalement, et le joueur se réveille **au poste de sécurité à 00:00**, début de sa ronde, avec un léger détail changé (le badge sur son uniforme a une date différente). Pas de « Game Over », la nuit recommence (ça nourrit la fin cachée).
- **On ne le voit jamais de face.** Toujours de dos, ou de profil au bout d'une allée qui tourne au coin. Si l'angle entre la caméra du joueur et son visage passe sous un seuil, il se détourne ou passe derrière un occluder. Silhouette : manteau long, bonnet, vêtements démodés.
- Son caddie : produits **périmés depuis des années**, étiquettes de prix **en francs** (visible en zoomant sur les caméras ou de près quand il est à l'arrêt).
- La fréquence et la durée des arrêts augmentent au fil de la nuit (cf. timeline).

### Règle 5 — Le magasin veut garder son monde
- Une porte de secours ouverte **se reverrouille** si elle sort du champ de vision du joueur pendant plus de *X* secondes (config, ~4 s). Tant que le joueur la regarde, elle reste ouverte.
- La seule sortie **toujours ouverte** : celle par laquelle le joueur est entré au début de la ronde (portes automatiques de l'entrée).
- Quand une porte se reverrouille hors champ : bruit de clenche lointain, jamais d'animation visible.

---

## Découverte clé : le vrai fonctionnement

Le joueur finit par comprendre (vers 4h) que **le magasin se redessine autour de lui quand il stagne**. Implémenter deux mécaniques distinctes dans `DwellTracker` :
- **Ancrage** (règle 1) : temps cumulé par rayon → stabilise ce rayon.
- **Stagnation** : si le joueur reste immobile (ou quasi immobile) dans un même module plus de *N* secondes (≈ 8 s en début de nuit, ≈ 3 s vers 4h30), les modules **adjacents hors champ** sont réagencés et les néons autour vacillent. Le joueur apprend qu'il ne doit jamais s'arrêter, même pour réfléchir ou regarder le plan.

Ouvrir le plan d'évacuation (`Tab`) ne met **pas** le jeu en pause : ça compte comme de la stagnation. C'est voulu.

---

## Équipement du joueur

- **Talkie** : seule connexion avec Sabine. Messages sous-titrés + voix placeholder (bips + souffle radio générés en Web Audio ; prévoir le hook pour de vraies voix). La voix se dégrade avec sa température : filtre passe-bas, volume qui baisse, coupures, phrases incomplètes. Sabine donne des infos utiles (ce qu'elle entend côté local technique, où elle pense que la clé est, etc.).
- **Trousseau** : une clé par porte, gérée dans `Inventory`. Sauf la chambre froide, dont il faut trouver le **double**.
- **Plan d'évacuation** : overlay 2D (canvas/`@babylonjs/gui`) du magasin **tel qu'il était avant minuit**. Le joueur peut le prendre en photo avec son téléphone au début de la ronde (interaction sur le plan à l'entrée) ; sinon il doit revenir à l'entrée pour le consulter. Le rayon 9 n'y figure pas.
- **Radio du magasin** : 8 morceaux d'ambiance en boucle (muzak de supermarché générée procéduralement : mélodies simples, accords majeurs, tempo lent, légèrement désaccordés). Chaque zone a son morceau. Si le joueur entre dans une zone **qui a été réagencée**, un **morceau inconnu** se met à jouer (même instrumentation mais mode mineur / intervalles bizarres / légèrement trop lent). Dans la phase finale, les morceaux « normaux » indiquent les zones restées stables = le chemin sûr.

---

## Timeline (heure in-game)

Durée totale cible : **45 à 60 minutes réelles** pour 00:00 → 06:00. La vitesse de l'horloge est dans `config.ts`. L'heure s'affiche uniquement sur la **montre du vigile** (bas d'écran, discrète).

| Heure | Phase | Ce qui se passe |
|---|---|---|
| 00:00 – 01:05 | **Le calme** | Ronde tutorielle sans tuto. Néons blancs. 2–3 clients insomniaques « normaux » (PNJ simples qui partent vers 00:45). Sabine à la caisse charrie Farid sur son nouveau poste. Le joueur apprend le magasin par cœur. Quelques micro-anomalies à peine perceptibles (un produit qui change d'étagère). |
| 01:05 | Déclencheur | Sabine part vérifier un stock en chambre froide. |
| 01:10 | Appel talkie | Sabine panique : la porte s'est refermée, verrou bloqué de l'extérieur. |
| 01:10 – 02:30 | **Le magasin change** | Le chemin connu ne mène plus au même endroit (rayon 5 à la place du rayon 8, etc.). Le joueur doit utiliser le plan d'évacuation. **Première rencontre avec le client** : rayon des conserves, dos au joueur, ne répond pas quand on l'appelle. Sur les caméras (en différé), on voit le contenu du caddie : produits périmés, prix en francs. |
| 02:30 – 04:00 | **Sabine se refroidit, le client s'arrête** | Sabine parle moins, sa lampe faiblit. Elle entend des pas qui font le tour du local technique en boucle, toujours au même rythme. **Moment clé** : le caddie immobile au milieu d'une allée, néon orange au-dessus du joueur → reculer sans bruit. Le rayon 9 apparaît. Le joueur trouve le double de clé (caisse de la boucherie, code à trouver) mais en arrivant, **la serrure de la chambre froide a changé**. |
| 04:00 – 05:00 | **Course contre le froid** | Sabine articule à peine. Néons qui clignotent partout, la radio boucle sur un morceau inconnu. Le caddie est croisé de plus en plus souvent, de plus en plus près, de plus en plus souvent immobile. Le joueur comprend la stagnation. |
| ~05:00 | **La chambre froide** | Ouverture. Sabine au sol, à moitié consciente. Le joueur la porte : vitesse −50 %, pas de course possible, seuil de stagnation réduit. Le chemin retour est entièrement redessiné : se fier au plan et aux morceaux « normaux » de la radio. |
| 06:00 | **Ouverture du magasin** | Voir fins. |

### Énigmes à implémenter (propositions, à garder simples et logiques)
- **Code de la caisse boucherie** : le code est visible **uniquement sur les caméras en différé** (on voit, dans un replay, une silhouette taper le code alors qu'en direct il n'y avait personne). Le joueur doit lire l'horodatage et regarder au bon moment.
- **Serrure changée** : la nouvelle serrure est celle d'une autre porte du magasin (ex. la porte du local technique). Une des clés du trousseau marche, mais seulement si le joueur arrive devant la porte **sans avoir stagné** dans les 30 dernières secondes ; sinon la serrure change encore. Indice via Sabine : « Elle bouge quand t'attends… viens direct. »

---

## Fins

- **Fin normale** : Sabine sortie avant 06:00. Fondu : les employés du matin arrivent, la lumière du jour passe par les vitrines, le magasin est parfaitement normal. Texte final : Sabine s'en sort, hypothermie mais vivante.
- **Mauvaise fin — le froid** : la température de Sabine tombe à zéro. Silence radio. Le joueur peut continuer à errer ; à 06:00, le magasin redevient normal, la chambre froide est vide et propre, et personne ne se souvient de Sabine.
- **Boucle** (pas une fin) : attrapé par le client → retour à 00:00, cf. règle 4. Chaque boucle ajoute un badge dans la pile du local technique.
- **Fin cachée** : conditions cumulées :
  1. avoir regardé sur les caméras en différé la scène injectée où **le client s'arrête devant la caméra et regarde droit dans l'objectif**, à un moment où il n'y avait personne en direct à cet endroit ;
  2. avoir fouillé le local technique et trouvé la **pile d'anciens badges d'employés**, dont un au nom de Farid, **daté d'il y a trois semaines** — la date où il a commencé.
  Dernière image : la caméra du poste de sécurité montre, en différé, Farid lui-même en train de regarder les écrans. Texte : *« T'as peut-être déjà fait cette nuit. »*

---

## UX / ressenti

- **Aucun HUD** hormis la montre, les sous-titres du talkie et le prompt d'interaction (`E`).
- **Sons avant tout** : roulettes du caddie, pas sur le carrelage (plus forts en courant — la course est audible par le client dans un rayon config), bourdonnement des néons, compresseurs des frigos, radio d'ambiance. Tout spatialisé.
- **Pas de jumpscare**, pas de cri, pas de flash. La tension vient du silence qui s'installe (les roulettes qui s'arrêtent) et des lumières.
- Menu : Jouer, Options (sensibilité souris, FOV, volume, disposition clavier AZERTY/QWERTY, vitesse de l'horloge), Quitter. Écran de chargement sobre.
- Accessibilité : option pour sous-titrer les sons importants (« [roulettes qui s'arrêtent] »), option pour désactiver le grain/l'aberration.

---

## Mode debug (F1)

Overlay avec : seed actuelle, heure in-game, état du client + sa position sur une mini-carte, heatmap d'ancrage des rayons, timer de stagnation, décalage actuel des caméras, température de Sabine, raccourcis pour sauter à une heure donnée. Indispensable pour tester chaque phase sans rejouer toute la nuit.

---

## Méthode de travail (étapes livrables)

Avance **étape par étape**. À chaque étape : le jeu doit se lancer et être jouable, `npm run build` passe, un commit clair. Ne passe pas à l'étape suivante tant que la précédente ne marche pas.

1. **Squelette** : Vite + TS + Babylon, contrôleur FPS, magasin en gray-box construit depuis `StoreLayout` (tous les rayons, entrée, réserve, chambre froide, local technique), `GameClock`, montre HUD, mode debug de base.
2. **Règle 1 + plan** : graphe de modules, `DwellTracker` (ancrage + stagnation), `ReshuffleSystem` hors champ avec raycasts, overlay plan d'évacuation.
3. **Règle 3 + règle 4** : `NeonSystem`, `ShopperAI` complet (4 états), `NoiseSystem`, boucle de retour à 00:00.
4. **Règle 2** : ring buffer de snapshots, écrans de surveillance au poste de sécurité avec replay différé et horodatage, événements injectés.
5. **Règle 5 + portes** : clés, trousseau, portes de secours qui se reverrouillent hors champ.
6. **Narration** : `Timeline`, `Sabine` (température, lampe, dialogues qui se dégradent), talkie, PNJ du début.
7. **Radio** : 8 morceaux procéduraux + morceaux inconnus liés aux zones réagencées.
8. **Énigmes + portage + fins** : code boucherie, serrure changeante, portage de Sabine, 3 fins + boucle.
9. **Polish** : post-process, sons, équilibrage via `config.ts`, perf (profiling, instancing des étagères et produits avec `thinInstances`).

Avant de coder l'étape 1, rédige un court `DESIGN.md` qui résume ta compréhension des règles et liste les points que tu trouves ambigus, avec la solution que tu retiens pour chacun. Ensuite, attaque.

---

## Contraintes finales

- Tous les textes du jeu (dialogues, UI, sous-titres) en **français**, ton naturel. Sabine parle comme une vraie collègue : familière, drôle au début, puis de plus en plus courte et hachée.
- Code lisible, typé, commenté seulement là où la logique n'est pas évidente (réagencement, replay, IA).
- Pas de dépendance lourde en plus de Babylon sans raison forte.
- Ne jamais montrer le client de face. Ne jamais réagencer sous les yeux du joueur. Ce sont les deux règles d'or : si un bug les casse, c'est un bug bloquant.
