# RAYON 9

Jeu d'horreur à la première personne en Babylon.js. Supermarché « Bellevue », nuit du 30 au 31 octobre : ta collègue est enfermée dans la chambre froide, et passé minuit le magasin ne respecte plus ses propres règles.

- `PROMPT_RAYON9.md` : le concept complet et le cahier des charges
- `DESIGN.md` : les choix de design et l'avancement

## Lancer le jeu

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # vérification TypeScript + build de prod dans dist/
npm test         # tests Vitest (occlusion, réagencement, client, caméras, portes, timeline)
```

## Contrôles

| Touche | Action |
|---|---|
| ZQSD / WASD / flèches | se déplacer |
| Maj | courir (ça s'entend) |
| Souris | regarder |
| E | interagir : portes (avec le trousseau), plan d'évacuation, écrans du poste |
| T | appeler Sabine au talkie (elle te donne des indices selon la situation) |
| Tab | sortir / ranger le téléphone (photo du plan) |
| E sur un écran du poste | vue plein écran de la caméra ; ← → pour changer, E pour revenir |
| Échap | pause |
| F1 | overlay de debug (fps, draw calls, mini-carte, client, Sabine, portes…) |
| `[` / `]` (debug ouvert) | reculer / avancer l'horloge de 15 min |
| R (debug ouvert) | forcer un échange de deux rayons cachés |
| J (debug ouvert) | mettre le client à l'arrêt 9 m devant toi (néons orange ; cours pour le réveiller) |

Options (écran titre ou pause) : sensibilité, volume, champ de vision, qualité (basse / moyenne / haute), grain et aberration. Si ton PC rame, passe en « Basse » ; le jeu baisse aussi tout seul la résolution s'il descend sous ~48 fps.

Astuce caméras : elles montrent le passé (2 à 4 min de jeu, soit 18 à 36 s réelles). Juste après un saut dans le temps en debug, elles affichent « PAS DE SIGNAL » le temps d'enregistrer assez d'historique.

`http://localhost:5173/?play` démarre direct, sans écran titre ni pointer lock (pratique pour tester). En console, `window.rayon9` donne accès au jeu : `rayon9.player.teleport(18, 25, 0)`, `rayon9.clock.set(150)`…
