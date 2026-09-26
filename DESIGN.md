# RAYON 9 — Notes de design

Ce fichier résume comment je comprends les règles de `PROMPT_RAYON9.md` et comment je tranche les points ambigus. Il évolue à chaque étape.

## Les trois piliers

1. **L'espace ment** : le magasin se réorganise, mais jamais sous les yeux du joueur.
2. **L'info arrive en retard** : les caméras montrent le passé (2 à 4 min de jeu).
3. **La menace est dangereuse quand elle s'arrête** : le caddie qui roule est inoffensif, celui qui s'arrête ne l'est pas.

Deux règles d'or, toute violation est un bug bloquant :
- le client n'est **jamais** vu de face ;
- un réagencement ne se produit **jamais** dans le champ de vision.

## Le lieu

- Surface de vente 36 × 49 m, arrière-boutique 36 × 10 m, plafond à 4,2 m.
- 9 **slots** en grille 3 × 3 (6 × 9 m chacun), séparés par des allées de 3 à 5 m.
- 8 rayons + un **présentoir Halloween** dans le slot vide (fond, à droite). C'est l'emplacement où apparaîtra le rayon 9 et il est vide sur le plan d'évacuation.
- Pièces fixes : poste de sécurité, entrée/caisses, local technique, chambre froide, réserve. Elles ne bougent jamais.
- La chambre froide donne sur la réserve et partage un mur avec le local technique (Sabine entend les pas de l'autre côté).

## Points ambigus et choix retenus

| # | Ambiguïté | Choix |
|---|---|---|
| 1 | Règle 1 : « les rayons où tu passes le **moins** de temps bougent le plus », mais à 4h : « **plus** tu traînes, plus il redessine ». | Deux mécaniques distinctes dans `DwellTracker`. **Ancrage** : le temps cumulé dans un rayon le stabilise (probabilité de déplacement inversement proportionnelle). **Stagnation** : rester quasi immobile plus de N s (8 s en début de nuit, 3 s vers 4h30) réagence les slots voisins hors champ. |
| 2 | Qu'est-ce qui bouge exactement ? | Seul le contenu des slots (quel rayon est où). Murs, pièces, néons et allées ne bougent pas. Un module est un `TransformNode` qu'on déplace d'un slot à l'autre. |
| 3 | « Hors champ » | Un slot est caché quand **aucun** de ses points (gondoles, allée, panneaux suspendus, 30 points au total) n'est en ligne de vue. S'il est dans le cône de vision (cône de la caméra + 15° de marge), par exemple juste derrière la gondole à côté de toi, il doit en plus être masqué depuis 5 positions de tête décalées (±30 cm, +10 cm). Un pas de côté ou le balancement de la tête ne peut donc jamais révéler un rayon en train de changer. La règle stricte « hors du frustum ET masqué » bloquait presque tout, alors que la version avec les décalages de tête est tout aussi sûre. L'occlusion est calculée sur des boîtes (murs, gondoles, frigos) dans `world/Occlusion.ts`, sans le moteur 3D : c'est rapide (~1 ms pour 9 slots) et testé avec Vitest. |
| 4 | Caméras en différé | Pas de vrai buffer vidéo : un ring buffer de snapshots d'état (toutes les 0,2 s) rejoué dans les écrans. Ça permet aussi d'injecter des événements qui n'ont jamais eu lieu en direct. |
| 5 | Que se passe-t-il si le client attrape le joueur ? | Pas de game over : fondu au noir, retour à 00:00 au poste de sécurité. Un badge de plus apparaît dans la pile du local technique. Ça sert la fin cachée. |
| 6 | Le plan d'évacuation est « près de l'entrée ». Le joueur doit-il y retourner à chaque fois ? | Plan mural à gauche des portes automatiques. `E` le prend en photo, `Tab` sort le téléphone. La photo est un instantané du plan d'avant minuit, elle ne se met jamais à jour. Regarder son téléphone ne met pas le jeu en pause : ça ralentit (vitesse × 0,6) et **ça compte comme de la stagnation, même en marchant**. |
| 7 | AZERTY / QWERTY | Pas de réglage : on lit `KeyboardEvent.code` (position physique). ZQSD en AZERTY et WASD en QWERTY tombent sur les mêmes codes. Les flèches marchent aussi. |
| 8 | Durée de la nuit | 9 min réelles par heure de jeu, soit 54 min pour 00:00 → 06:00 (`CONFIG.clock`). |
| 9 | Portes des pièces à l'étape 1 | Ouvertes (cadres seulement). Les portes de secours sont fermées. Les vraies portes (clés, verrous, règle 5) arrivent à l'étape 5. L'entrée est bloquée par un mur invisible tant qu'il n'y a pas de fin. |
| 10 | Température de Sabine | Jauge 100 → 0. Démarre à 01:10, descend d'environ 20/h, plus vite après 4h. Elle pilote la voix (filtre passe-bas, coupures) et la lampe. Réglable dans `config.ts` à l'étape 6. |
| 11 | Code de la caisse boucherie | Visible seulement dans un replay des caméras, où une silhouette tape le code alors qu'il n'y avait personne en direct. |
| 12 | Serrure de la chambre froide qui change | Elle prend la forme de la serrure du local technique. La clé marche seulement si le joueur arrive sans avoir stagné dans les 30 dernières secondes, sinon elle change encore. |
| 13 | Rayon 9 | Absent du plan. Il apparaît après 2h30 dans le slot du présentoir Halloween, puis change de slot à chaque réagencement. Produits délavés, sans nom sur le panneau. |

## Règle 1 en pratique (étape 2)

- **Détour** : quitter un rayon le rend « instable ». Dès qu'il est complètement caché, on tire au sort une seule fois s'il bouge. La chance va de 75 % (jamais fréquenté) à 8 % (ancré, 90 s cumulées dedans). S'il bouge, il échange sa place avec un autre slot caché, de préférence peu ancré. Si le joueur fait demi-tour tout de suite, le rayon n'a jamais été caché, donc rien n'a changé. S'il revient par un autre chemin, le rayon a eu le temps de disparaître de sa vue.
- **Stagnation** : quand le seuil est atteint, deux slots cachés parmi les 4 plus proches échangent leur place. C'est prioritaire sur le reste.
- **Rayon 9** : à partir de 02:30, il remplace le présentoir Halloween dès que ce slot est caché, puis change de slot toutes les 25 s s'il est caché.
- **Conséquence** : les rayons à étagères basses (fruits et légumes 1,45 m, boulangerie 1,95 m, comptoir de la boucherie) cachent moins bien. Depuis leur allée, on voit par-dessus les panneaux des rayons voisins, donc ces zones « ouvertes » bougent moins autour du joueur. Les hautes gondoles (2,15 m) et les frigos sont les endroits où le magasin peut vraiment changer dans ton dos.
- Tout est piloté par `CONFIG.reshuffle` et `CONFIG.stagnation`.

## Règles 3 et 4 en pratique (étape 3)

- **Le client** (`systems/ShopperBrain.ts`, logique pure testée) apparaît à 01:10, le plus loin possible du joueur, et va d'abord au rayon des conserves. Il se déplace sur un graphe fixe (`world/NavGraph.ts`) : allées transversales, allées entre les colonnes, milieu de chaque allée de rayon. L'allée du présentoir Halloween est évitée.
- **SHOPPING** : 1 m/s dans les allées transversales, au pas (0,55 m/s) dans les rayons, où il prend des conserves (tintement dans le caddie). Il ne s'arrête jamais complètement : tant que ça roule, il est inoffensif. S'il voit le joueur devant lui, il change de rayon.
- **STOPPED** : à partir de 02:30, chaque « rencontre » (joueur à moins de 20 m) tire un arrêt au sort. La chance passe de 35 % à 02:30 à 70 % à 04:00 et 90 % à 05:00, et l'arrêt dure de 8 à 22 s, plus long en fin de nuit. Arrêté, il entend la **course (16 m)**, la **marche seulement de très près (2,5 m)**, et il réagit si on le touche. Reculer en marchant est donc silencieux. Il n'y a d'ailleurs pas de course à reculons.
- **HUNTING** : il fonce vers le dernier bruit, de 2 à 4,3 m/s en 6 s. Il te voit à moins de 10 m s'il a une ligne de vue, et il coupe tout droit quand le sol est dégagé. Il abandonne après 8 s sans t'entendre ni te voir.
- **Visage** : son corps se détourne dès que l'angle entre son regard et le joueur passe sous 110°. S'il est surpris de face au coin d'une allée, il est retourné d'un coup, sur la première frame où on le voit. En traque, il **recule vers toi, dos tourné**. Un test simule 5 min de ronde et vérifie à chaque frame qu'on ne voit jamais son visage.
- **Capture** : noir, silence, puis « 00:00 — Poste de sécurité » et le badge de Farid, dont la date recule de 3 semaines à chaque boucle. Le magasin, le plan photographié, l'ancrage et le client sont remis à zéro, et le compteur de boucles augmente (il servira à la pile de badges de la fin cachée).
- **Néons** (`systems/NeonSystem.ts`) : chaque tube a son matériau. Blanc par défaut. Quand le client est arrêté ou en traque, les tubes à moins de 5,5 m de lui passent à l'**orange**, et ceux à moins de 11 m **clignotent**. Quand il fait ses courses, le tube au-dessus de lui clignote légèrement. Un réagencement par stagnation fait aussi vaciller les néons autour du joueur. Les PointLight du pool prennent la couleur et l'intensité du tube, donc toute l'allée devient orange. Chaque rallumage fait un grésillement spatialisé.
- **Son** (`audio/`) : 100 % synthétisé en Web Audio (roulettes avec grondement, cliquetis et grincements, pas sur le carrelage, conserves, grésillements, bourdonnement des frigos). Spatialisé en HRTF. Les z sont inversés entre Babylon (main gauche) et Web Audio (main droite).

## Règle 2 en pratique (étape 4)

- **Enregistrement** (`systems/ReplayBuffer.ts`, testé) : toutes les 0,25 s réelles, un instantané contient l'heure de jeu, la place des rayons, Farid, le client et l'état de chaque néon. On garde 6 minutes de jeu. Un retour en arrière dans le temps (nouvelle nuit, debug) efface la suite. Un trou dans l'enregistrement affiche « PAS DE SIGNAL ».
- **Décalage** : `cameraDelay(t)` oscille entre 2 et 4 min de jeu (sinusoïde, période 95 min). L'incrustation ne montre que `31/10 HH:MM` de l'instant rejoué, pas les secondes (elles défileraient 6,7 fois trop vite à cause de la compression du temps). Pour connaître le décalage, il faut comparer avec la montre, et rien ne dit qu'il faut le faire.
- **Rendu** (`world/SecurityCameras.ts`) : 6 caméras au plafond, chacune avec son boîtier et sa LED rouge, et chacune rendue dans une RenderTargetTexture de 320 × 208. Juste avant le rendu d'une caméra, on remet le magasin dans l'état de l'instantané (rayons, client, néons, silhouette de Farid), puis on restaure l'état réel juste après. Les matrices sont recalculées à la main, car le rendu d'une RenderTargetTexture ne le fait pas. On ne rend les flux que quand le joueur est au poste de sécurité, une caméra par frame à tour de rôle (plus la caméra zoomée).
- **Farid sur les caméras** : une silhouette de vigile sur un calque visible uniquement par les caméras (`CCTV_ONLY_LAYER`). Tu te vois toi-même, avec quelques minutes de retard.
- **Effet vidéosurveillance** : shader maison (monochrome vert, scanlines, bruit, léger décalage de lignes, barre qui défile, vignette) avec l'incrustation par-dessus. Les écrans et la vue plein écran utilisent le même matériau.
- **Interaction** : `E` sur un écran pour le plein écran, `←`/`→` (ou Q/D) pour changer de caméra, `E`/`Tab`/`Échap` pour revenir. Pendant le zoom on ne marche pas, donc on stagne. C'est voulu.
- **Événements injectés** (`narrative/ReplayEvents.ts`) : ils modifient l'instantané pour une seule caméra. Le premier : entre 03:18 et 03:23 (heure rejouée), le client est planté devant la CAM 2 et fixe l'objectif, tête relevée. C'est la seule exception à la règle du visage, et elle est voulue : c'est un indice de la fin cachée. On ne voit pas de visage de toute façon, la tête est lisse. Si le joueur le regarde (zoom, ou devant le bureau face à l'écran), `client-objectif` est ajouté à `game.story`, qui survit aux boucles.

## Rendu

- Babylon.js 9, WebGL2. Hémisphérique faible + **pool de 4 PointLight** qui se collent aux néons les plus proches. Leur intensité décroît vers le bord du pool pour éviter les « pops ».
- Néons en matériau émissif avec bloom. Grain, légère aberration chromatique, vignette, brouillard EXP2 léger.
- Produits : un mesh à instances fines par rayon avec une couleur par instance, soit une draw call par rayon.
- Tout le statique (murs, caisses, racks…) est fusionné par matériau.

## Avancement

- [x] **Étape 1 — Squelette** : Vite + TS + Babylon, contrôleur FPS, magasin gray-box piloté par `StoreLayout`, horloge, montre, debug F1 avec mini-carte, écran titre et pause.
- [x] **Étape 2 — Règle 1 + plan** : `OcclusionMap`, `DwellTracker` (ancrage + stagnation), `ReshuffleSystem` (détour, stagnation, rayon 9), interaction `E`, photo du plan dans le téléphone (`Tab`), debug enrichi (heatmap d'ancrage, timer de stagnation, `R` pour forcer un échange), tests Vitest.
- [x] **Étape 3 — Néons + client + boucle** : `NavGraph`, `ShopperBrain` / `ShopperModel` / `ShopperAI`, `NeonSystem`, `NoiseSystem`, audio procédural, boucle à 00:00, debug (état du client sur la mini-carte, `J` pour le mettre à l'arrêt devant soi).
- [x] **Étape 4 — Caméras en différé** : `ReplayBuffer`, `SecurityCameras` (6 flux, shader vidéosurveillance, zoom), silhouette de Farid visible seulement par les caméras, événements injectés (`client-objectif`), debug (décalage, début de l'enregistrement, découvertes).
- [ ] Étape 5 — Portes, clés, règle 5
- [ ] Étape 6 — Narration, Sabine, talkie
- [ ] Étape 7 — Radio du magasin
- [ ] Étape 8 — Énigmes, portage, fins
- [ ] Étape 9 — Polish
