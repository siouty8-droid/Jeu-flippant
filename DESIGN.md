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
| 8 | Durée de la nuit | 9 min réelles par heure de jeu, soit 54 min pour 00:00 → 06:00 (`CONFIG.clock`). Réglable dans les options : 36, 54 ou 72 min. |
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

## Règle 5 et portes (étape 5)

- `world/Doors.ts` : chaque porte a son gond (TransformNode), un panneau animé (0,4 s), une clé du trousseau et un sens d'ouverture. Une porte fermée bloque la vue et le passage du client (volume dynamique dans l'`OcclusionMap`).
- **Trousseau** (dans la pause) : clés du poste de sécurité, du local technique, des sorties de secours et de la chambre froide. Au début de la nuit, le poste de sécurité et la double porte de la réserve sont ouverts. Le local technique et les sorties de secours sont fermés à clé.
- **Sécurité** : on ne peut pas ouvrir une porte qui s'ouvre vers soi, ni en fermer une quand on est dans l'encadrement.
- **Règle 5** : une sortie de secours ouverte se referme et se **reverrouille** après 4 s sans être regardée (champ de vision + ligne de vue). On entend une clenche retomber au loin.
- **On ne sort pas** : franchir une sortie de secours ouverte te fait réapparaître à l'intérieur, devant la sortie suivante (ouest → est → réserve), grande ouverte dans ton dos. Elle se referme dès que tu ne la regardes plus. La seule vraie sortie reste l'entrée, gardée par un mur invisible jusqu'aux fins (étape 8). Farid refuse de partir : « Je peux pas partir sans Sabine. »
- **Chambre froide** : à 01:10, la porte claque et une targette neuve apparaît côté réserve. Aucune clé du trousseau ne marche. Le double (caisse de la boucherie) et la serrure qui change arrivent à l'étape 8.

## Narration (étape 6)

- `systems/Npcs.ts` : Sabine est assise derrière la caisse 1. Deux clients insomniaques (le monsieur à la banane, une étudiante en sweat) se promènent d'un rayon à l'autre, puis sortent vers 00:38 et 00:52. Tous sont rejoués sur les caméras.
- `narrative/Narrative.ts` : la timeline, avec des événements déclenchés une seule fois par nuit.
  - **00:00** : Sabine t'accueille au talkie. Elle te charrie quand tu passes à sa caisse.
  - **01:05** : elle part en chambre froide (elle traverse le magasin et ouvre les portes).
  - **01:10** : la porte claque, mais **seulement quand personne ne la regarde et que le joueur n'est pas dedans**. Puis vient l'appel paniqué.
  - Ensuite : indice sur les rayons qui bougent, réaction au premier client aperçu, les pas en rond dans le local technique (02:30, sons spatialisés), le rayon 9, le froid (04:00).
  - **Chuchotements** : quand le client s'arrête à moins de 15 m, elle chuchote.
  - **Porte de la chambre froide** : elle frappe à la porte quand tu es juste derrière.
- **Température** : 100 → 0. Elle perd 16 par heure jusqu'à 04:00, puis 30 par heure, donc un silence radio vers 05:50 si personne ne la sort. La voix se dégrade avec le froid : texte abîmé (mots perdus, « … »), volume, coupures, filtre plus sourd.
- **Talkie** (`narrative/Talkie.ts`) : une réplique à la fois, sous-titrée avec le nom de la personne qui parle. Il y a trois types de répliques : talkie (grésillement et voix filtrée), en direct (voix spatialisée) et pensée (italique). La voix est synthétisée en Web Audio, avec des syllabes, des formants et un filtre radio.
- **Touche T** : Farid appelle Sabine, qui répond selon la situation. C'est le système d'indices : danger immédiat, photo du plan, chemin de la réserve, porte verrouillée…
- **06:00** : pour l'instant, un écran d'aube (sauvée ou non) puis retour au titre. Les vraies fins arrivent à l'étape 8.

## Radio du magasin (étape 7)

- **Composition** (`audio/Muzak.ts`, logique pure et testée) : chaque morceau est tiré d'une graine.
  - Tempo lent (72–90 bpm), mode majeur, accords de septième un peu lounge.
  - Nappe, piano électrique en synthèse FM, basse, vibraphone pour la mélodie, charleston et grosse caisse feutrés.
  - Le motif de mélodie est rejoué et recalé sur les accords. Chaque note est légèrement désaccordée.
- **Morceaux inconnus** : même instrumentation, mais :
  - en mineur ou en phrygien ;
  - des intervalles de travers (triton, seconde mineure) et des notes qui manquent ;
  - un peu trop lents (58–68 bpm) et plus désaccordés, avec un pleurage de bande.
- **Qui passe quoi** (`systems/RadioDirector.ts`, testé) :
  - Chaque rayon du plan a son morceau, soit **8 morceaux**. Il passe dans les haut-parleurs de l'emplacement de ce rayon.
  - Le présentoir Halloween n'est pas un rayon : il passe le morceau du rayon devant lui.
  - Si un emplacement contient un autre rayon que sur le plan, on y entend un **morceau inconnu**, propre à cette combinaison emplacement + rayon.
  - Dans les allées, on entend l'emplacement le plus proche, avec 1,5 m d'hystérésis pour éviter le va-et-vient.
  - Le son est étouffé dans la réserve, le poste et le local technique. Pas de musique dans la chambre froide.
  - **Entre 04:00 et 05:00**, tant que Sabine est enfermée, toute la radio boucle sur un seul morceau inconnu.
- **Lecture** (`audio/StoreRadio.ts`) :
  - Tous les morceaux tournent sur une horloge commune, comme une vraie radio : quand tu reviens dans une zone, le morceau a avancé.
  - Changer de zone fait un fondu enchaîné de 2 s.
  - Les notes sont programmées 400 ms en avance à chaque frame, soit environ 9 notes par seconde. En cas de retard (onglet en arrière-plan), la lecture se recale au lieu de rattraper.
  - Le son passe par un filtre « petit haut-parleur de plafond ».
- Sabine y fait allusion : « Six ans que j'entends les mêmes huit chansons ». Au talkie (T), elle peut aussi dire : « Si tu connais pas l'air, c'est que t'es plus là où tu crois. »

## Énigmes, portage et fins (étape 8)

- **Caisse de la boucherie** (`systems/ButcherRegister.ts`) :
  - Elle est fermée par un code à 4 chiffres, fixé par la graine, donc **le même d'une boucle à l'autre** : celui qui a déjà fait la nuit le connaît.
  - `E` ouvre un petit clavier. Taper le code fait stagner, comme tout ce qu'on lit.
  - Le tiroir contient le double de la clé de la chambre froide.
  - Bug corrigé au passage : depuis l'étape 1, la caisse était plantée dans la vitrine réfrigérée. La vitrine s'arrête maintenant avant le bout du comptoir, et la caisse a son afficheur client sur un mât.
- **Le code n'existe que sur les caméras** (`narrative/ReplayEvents.ts`) :
  - Toutes les 20 minutes de l'heure rejouée (à 10, 30 et 50, à partir de 02:30), la CAM 4 « voit » un vigile en uniforme taper le code. En direct, il n'y avait personne.
  - La caméra affiche « ▲ MOUVEMENT », bipe au poste, puis **zoome toute seule** (PTZ, jusqu'à ×20) sur l'afficheur, où les chiffres apparaissent un par un.
  - Pendant la scène, la caméra montre le magasin tel qu'il est sur le plan.
  - Le vigile, c'est Farid : un indice de plus pour la fin cachée.
  - Sabine, au talkie, donne le rythme (« à dix, à trente, à cinquante ») et la caméra (« celle du fond »). Pour tomber au bon moment, il faut lire l'horodatage des écrans, en différé.
- **Serrure changeante** (`systems/ColdLock.ts`, testé) :
  1. Au début, c'est un verrou neuf avec un cadenas en laiton.
  2. Dès que Farid a le double en poche, la serrure change **hors de sa vue** : c'est maintenant celle du local technique, avec une pastille bleue. Le double ne rentre même plus.
  3. Une serrure changée s'examine d'abord (`E`). Ensuite, `E` essaie la clé du trousseau qui correspond. Elle ne tourne que si Farid **n'a pas stagné** (plus de 2,5 s sur place, téléphone et clavier compris) **dans les 30 dernières secondes**.
  4. Sinon, la serrure change encore dès qu'il détourne les yeux : pastille verte (sorties de secours) ou rouge (poste). Après le premier échec, Sabine explique : « Elle bouge quand t'attends… Viens direct. »
  5. Le verrou saute, la porte s'ouvre avec `E`, et Sabine arrête de se refroidir.
- **Porter Sabine** : `E` sur elle, par terre dans la chambre froide.
  - Farid avance à 50 % de sa vitesse, sans pouvoir courir, et le seuil de stagnation tombe à 55 %.
  - En vue subjective, on voit ses bras passés par-dessus les épaules de Farid. Ils sont sur un calque que les caméras ne voient pas.
  - Elle parle à l'oreille de Farid (voix « en direct » depuis sa position) et se réchauffe doucement.
  - **Le retour est redessiné** : le magasin converge vers un nouvel agencement, un emplacement caché à la fois, donc jamais sous les yeux du joueur. Tout change sauf **un chemin stable**, un emplacement par rangée du fond vers l'entrée, qui ne se décale que d'une colonne. Ce chemin reste comme sur le plan et y passe les morceaux connus.
  - Le client évite les allées de ce chemin tant qu'elles sont intactes. Stagner peut les casser.
  - L'entrée s'ouvre enfin : franchir les portes automatiques avec Sabine, c'est la fin normale.
- **Fins** (`narrative/Endings.ts`, testé) :
  - **Normale** : sortie avec Sabine, ou 06:00 avec Sabine dans les bras. On voit le parking au petit matin, le magasin éclairé par le jour. « Sabine s'en sort. Hypothermie, trois jours d'hôpital. Vivante. »
  - **Le froid** : 06:00 sans l'avoir sortie. Si sa température atteint 0 avant, c'est le silence radio et elle disparaît : derrière la porte, il ne reste que sa lampe, éteinte. À l'aube, on voit la réserve, la chambre froide ouverte, vide et propre. « Personne ne se souvient de Sabine. »
  - **Cachée** (épilogue de l'une ou l'autre fin) : il faut avoir vu le client fixer la CAM 2 en différé, **et** fouillé la pile de badges du local technique. On y trouve d'anciens vigiles (le dernier a tenu dix jours) et un badge au nom de Farid, daté de son embauche. Il y en a un de plus à chaque boucle.
    - Dernière image : la CAM 0, une caméra qui n'existe pas, filme le poste de sécurité en différé, daté du jour de son embauche. Farid y regarde les écrans.
    - « T'as peut-être déjà fait cette nuit. »
- Chaque fin ramène à l'écran titre. Le compteur de boucles et les découvertes survivent (la pile de badges grossit).
- **Accessibilité** : option « Sous-titrer les sons ». Elle affiche :
  - [les roulettes s'arrêtent] ;
  - [♪ un air que tu n'as jamais entendu] ;
  - [une clenche retombe, au loin] ;
  - [bip · mouvement sur la CAM 4].

## Performance (passe de l'étape 5/6)

Mesures (logique du jeu hors rendu, par frame) : **1,73 ms → 0,27 ms**. Draw calls : **181 → 108** à l'entrée, **107 → 71** dans une allée.

- Rendu à la résolution CSS (plus d'adaptation au ratio de pixels, qui quadruplait le coût sur écran Retina), plus une **résolution adaptative** calme : baisse si < 48 fps pendant 3 s, remonte après 12 s de marge, jamais plus d'un changement par 6 s (un changement réalloue le post-traitement).
- **Réglage de qualité** (basse / moyenne / haute) : MSAA, bloom, plage de résolution. Grain et aberration désactivables. Sensibilité, volume et champ de vision sont réglables, et tout est gardé dans le navigateur.
- Les **37 néons** sont un seul mesh à instances fines (une couleur par tube).
- `world/Merge.ts` fusionne les meshes statiques par matériau : rayons, silhouettes (sauf les jambes), poignées, caddies garés, boîtiers de caméras.
- La visée (`E`) ne teste plus que les objets interactifs, et les murs via l'occlusion (avant : tous les meshes, 10 fois par seconde).
- La visibilité des rayons n'est calculée que si quelque chose peut bouger.
- L'éclairage ne crée plus d'objets à chaque frame, et le debug ne calcule rien quand il est fermé.
- **Pré-compilation** au chargement : client, rayon 9, silhouette de Farid et verrou sont affichés le temps de compiler leurs shaders, ce qui évite un à-coup à leur première apparition.
- **Bug corrigé** : les écrans du poste étaient rendus dans les caméras qu'ils affichent (boucle de rétroaction WebGL, erreurs et travail GPU pour rien).
- **Autres bugs corrigés** :
  - Le client pouvait traverser un mur en visant un point hors du graphe.
  - Un rayon pouvait être réagencé sous les pieds du client ou d'un PNJ.
  - Après une boucle sans pointer lock, le jeu reprenait sans souris : il passe maintenant par la pause.
  - Le HUD passait à travers le menu pause.

## Polish (étape 9)

- **Chargement** : le jeu n'importe plus l'index de Babylon (tout le moteur) mais seulement ce qu'il utilise (`src/babylon.ts`, imports profonds et effets de bord nécessaires).
  - JS : 7,1 Mo → **1,58 Mo** (1,6 Mo → **398 Ko** compressé).
  - Build : 100 s → 16 s.
- **Son** :
  - **Réverbération** du magasin : une réponse impulsionnelle synthétique de 1,7 s, dont les aigus s'éteignent vite. Chaque son spatialisé y envoie une part. Une petite part constante part avant la spatialisation, donc un son lointain arrive surtout par l'écho : le caddie s'entend de partout, de loin.
  - **Ambiance spatialisée** (`audio/Ambience.ts`) :
    - une ventilation grave partout ;
    - le ballast du néon le plus proche, qui grésille au-dessus de toi ;
    - les compresseurs des surgelés et de la vitrine de la boucherie, qui suivent leur rayon quand il bouge (on peut l'entendre changer de place) ;
    - le compresseur de la chambre froide, qu'on entend à travers la réserve ;
    - les frigos qui s'arrêtent et repartent par cycles, avec un « clonk ».
  - **Souffle** (`audio/Breath.ts`) : Farid s'essouffle en courant et en portant Sabine. Il **retient sa respiration** quand le client est arrêté ou en traque à moins de 12 m : le silence, c'est la tension. Portée, Sabine respire faiblement à son oreille.
  - Les pas sont plus lourds en la portant, et s'entendent à 3,2 m au lieu de 2,5.
- **Post-process** :
  - **Tension** : quand le client est arrêté (à moins de 18 m) ou en traque, l'image se resserre en douceur (vignette, grain, aberration, contraste, un peu moins de lumière). Rien de brusque, pas de jumpscare.
  - Dans la chambre froide, les bords de l'image bleuissent.
  - En portant Sabine, la tête tangue légèrement d'un côté à l'autre.
- **Menu** :
  - « Durée de la nuit » (vitesse de l'horloge) ;
  - « Abandonner la ronde » dans la pause (retour au titre, sans compter de boucle) ;
  - sous-titres des sons (étape 8).
  - La disposition AZERTY/QWERTY n'a pas besoin de réglage : les touches sont lues par position physique.
- **Debug** : `1` à `6` sautent aux moments clés (00:55, 01:12, 02:28, 03:58, 04:58, 05:55).
- **Perf** (mesurée dans Chromium sans carte graphique, donc en logiciel) :
  - La logique du jeu prend **0,3 à 0,4 ms par frame**. La radio et l'ambiance sont négligeables.
  - Draw calls : 113 à l'entrée, 76 dans une allée, 54 dans la réserve, 26 au poste.
  - Les produits sont un mesh à instances fines par rayon. Les étagères d'un rayon sont fusionnées en un seul mesh : un rayon, c'est quelques draw calls, qu'on déplace en bloc lors d'un réagencement ou d'un replay de caméra.
  - Instancier les étagères *entre* rayons forcerait à réécrire les tampons à chaque rendu de caméra en différé : ce n'est pas rentable.
- **Équilibrage** : tout est dans `config.ts`. Les valeurs retenues :
  - la nuit dure 54 min ;
  - le client arrive à 01:10 et s'arrête à partir de 02:30 ;
  - le code passe sur la CAM 4 toutes les 20 min dès 02:30 ;
  - Sabine perd 16 °/h puis 30 °/h après 04:00, donc silence vers 05:50 ;
  - la serrure demande 30 s sans stagner ;
  - en portant Sabine : vitesse × 0,5 et seuil de stagnation × 0,55.
  - Ce n'est pas encore testé à la manette par un vrai joueur. Ce sont les premiers chiffres à retoucher.

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
- [x] **Étape 5 — Portes, clés, règle 5** : `DoorSystem`, trousseau, sorties de secours qui se reverrouillent et qui te renvoient dans le magasin, verrou de la chambre froide.
- [x] **Étape 6 — Narration** : Sabine et les clients du début de nuit (`Npcs`), timeline (`Narrative`), talkie avec voix synthétique, touche T (indices), température, pas dans le local technique, écran d'aube provisoire. Plus la passe perf et bugs ci-dessus.
- [x] **Étape 7 — Radio du magasin** : `Muzak` (composition seedée), `RadioDirector` (zone → morceau, inconnus sur les emplacements réagencés, boucle inconnue 04:00-05:00), `StoreRadio` (Web Audio, horloge commune, fondus).
- [x] **Étape 8 — Énigmes, portage, fins** :
  - `ButcherRegister` + clavier ;
  - scène du code sur la CAM 4 (vigile fantôme, zoom PTZ, alerte « MOUVEMENT ») ;
  - `ColdLock` (serrure qui change, règle des 30 s) ;
  - portage de Sabine (bras en vue subjective, redessin final avec chemin stable, entrée ouverte) ;
  - `Endings` (normale, froid, cachée avec la CAM 0) ;
  - pile de badges ;
  - sous-titres des sons ;
  - debug (K : double, L : ouvrir la chambre froide).
- [x] **Étape 9 — Polish** : bundle allégé (imports profonds), réverbération, ambiance spatialisée, souffle, post-process de tension et de froid, durée de la nuit et abandon dans le menu, sauts d'heure en debug.
