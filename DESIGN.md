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
| 3 | « Hors champ » | Le slot doit être hors du frustum **et** masqué d'après des raycasts depuis l'œil du joueur. Au moindre doute, on ne bouge rien. |
| 4 | Caméras en différé | Pas de vrai buffer vidéo : un ring buffer de snapshots d'état (toutes les 0,2 s) rejoué dans les écrans. Ça permet aussi d'injecter des événements qui n'ont jamais eu lieu en direct. |
| 5 | Que se passe-t-il si le client attrape le joueur ? | Pas de game over : fondu au noir, retour à 00:00 au poste de sécurité. Un badge de plus apparaît dans la pile du local technique. Ça sert la fin cachée. |
| 6 | Le plan d'évacuation est « près de l'entrée ». Le joueur doit-il y retourner à chaque fois ? | Plan mural à gauche des portes automatiques. On pourra le prendre en photo (interaction, étape 2) pour le consulter avec `Tab`. La consultation ne met pas le jeu en pause : ça compte comme de la stagnation. |
| 7 | AZERTY / QWERTY | Pas de réglage : on lit `KeyboardEvent.code` (position physique). ZQSD en AZERTY et WASD en QWERTY tombent sur les mêmes codes. Les flèches marchent aussi. |
| 8 | Durée de la nuit | 9 min réelles par heure de jeu, soit 54 min pour 00:00 → 06:00 (`CONFIG.clock`). |
| 9 | Portes des pièces à l'étape 1 | Ouvertes (cadres seulement). Les portes de secours sont fermées. Les vraies portes (clés, verrous, règle 5) arrivent à l'étape 5. L'entrée est bloquée par un mur invisible tant qu'il n'y a pas de fin. |
| 10 | Température de Sabine | Jauge 100 → 0. Démarre à 01:10, descend d'environ 20/h, plus vite après 4h. Elle pilote la voix (filtre passe-bas, coupures) et la lampe. Réglable dans `config.ts` à l'étape 6. |
| 11 | Code de la caisse boucherie | Visible seulement dans un replay des caméras, où une silhouette tape le code alors qu'il n'y avait personne en direct. |
| 12 | Serrure de la chambre froide qui change | Elle prend la forme de la serrure du local technique. La clé marche seulement si le joueur arrive sans avoir stagné dans les 30 dernières secondes, sinon elle change encore. |
| 13 | Rayon 9 | Absent du plan. Il apparaît après 2h30 dans le slot du présentoir Halloween, puis change de slot à chaque réagencement. Produits délavés, sans nom sur le panneau. |

## Rendu

- Babylon.js 9, WebGL2. Hémisphérique faible + **pool de 4 PointLight** qui se collent aux néons les plus proches. Leur intensité décroît vers le bord du pool pour éviter les « pops ».
- Néons en matériau émissif avec bloom. Grain, légère aberration chromatique, vignette, brouillard EXP2 léger.
- Produits : un mesh à instances fines par rayon avec une couleur par instance, soit une draw call par rayon.
- Tout le statique (murs, caisses, racks…) est fusionné par matériau.

## Avancement

- [x] **Étape 1 — Squelette** : Vite + TS + Babylon, contrôleur FPS, magasin gray-box piloté par `StoreLayout`, horloge, montre, debug F1 avec mini-carte, écran titre et pause.
- [ ] Étape 2 — Règle 1 + plan (ancrage, stagnation, réagencement hors champ, photo du plan)
- [ ] Étape 3 — Néons (règle 3) + client au caddie (règle 4) + boucle
- [ ] Étape 4 — Caméras en différé (règle 2)
- [ ] Étape 5 — Portes, clés, règle 5
- [ ] Étape 6 — Narration, Sabine, talkie
- [ ] Étape 7 — Radio du magasin
- [ ] Étape 8 — Énigmes, portage, fins
- [ ] Étape 9 — Polish
