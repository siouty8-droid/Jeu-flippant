import type { Rng } from "../core/Rng";

/**
 * Toutes les répliques du jeu. Sabine parle comme une vraie collègue : elle charrie,
 * elle est drôle au début… puis de plus en plus courte et hachée avec le froid.
 */

export type Speaker = "sabine" | "farid" | "pensee";
export type Via = "talkie" | "direct" | "inner";

export interface Line {
  speaker: Speaker;
  text: string;
  via: Via;
}

const S = (text: string, via: Via = "talkie"): Line => ({ speaker: "sabine", text, via });
const F = (text: string): Line => ({ speaker: "farid", text, via: "talkie" });
const P = (text: string): Line => ({ speaker: "pensee", text, via: "inner" });

export const D = {
  introFirst: [S("Farid ? C'est Sabine, caisse 1. T'es bien arrivé ? Fais ta ronde tranquille, et touche pas aux Kinder, je les ai comptés.")],
  introLoop: [S("Farid… ça va ? T'as une tête de déterré. T'as déjà fait ta ronde ou quoi ? …Bon. Vas-y.")],

  greetingFirst: [
    S("Alors le nouveau, trois semaines et toujours vivant ? Respect. Le dernier vigile, il a tenu dix jours.", "direct"),
    S("Si tu cherches le café, y'en a plus. Si tu cherches un sens à ta vie, rayon 4, à côté des céréales.", "direct"),
  ],
  greetingLoop: [S("…Pourquoi tu me regardes comme ça ? On s'est déjà vus ce soir ? Non. Tu viens d'arriver.", "direct")],

  nearBanter: [
    S("Le monsieur des fruits, il vient tous les soirs acheter une seule banane. Une. Je juge pas.", "direct"),
    S("T'as vu la promo Halloween ? Moins trente pourcent sur les bonbons. Ils ont mis les citrouilles dans le fond, personne va les voir.", "direct"),
    S("La nuit c'est calme. Trop calme. Mais bon, c'est payé pareil.", "direct"),
    S("Tu fais ta ronde ou tu fais la conversation ? Parce que moi je suis payée pour scanner, pas pour te divertir.", "direct"),
  ],

  earlyRadio: [
    S("Test radio. Tu m'entends ? …Parfait. Rayon 4, y'a des Granola qui m'attendent, je dis ça je dis rien."),
    S("Info : la dame en sweat bleu, elle a déjà fait trois fois le tour du rayon épicerie. Elle trouvera pas ce qu'elle cherche, on l'a plus depuis 2019."),
    S("Farid, si tu passes devant les surgelés, dis-moi si le frigo du fond fait encore son bruit bizarre."),
  ],

  leaving: [S("Farid, je vais en chambre froide vérifier la livraison, y'a un truc qui colle pas avec le bon. Deux minutes. Garde la boutique.")],
  leavingDirect: [S("Je vais en chambre froide, deux minutes. Garde la boutique, chef.", "direct")],

  panic: [
    S("Farid ?! FARID ! La porte s'est fermée toute seule ! Je peux plus sortir !"),
    S("Y'a… y'a un verrou. Dehors. J'ai entendu quelqu'un le fermer. Y'a pas de verrou sur cette porte, Farid, y'en a jamais eu !"),
    S("Viens me chercher. Par la réserve. Vite, il fait super froid là-dedans."),
  ],

  rule1Hint: [S("Farid… le chemin que tu connais par cœur… il mène plus au même endroit. Me demande pas comment je sais. Regarde le plan à l'entrée.")],

  shopperFirstSeen: [S("Attends… y'a un client ? À cette heure ? Farid, je l'ai jamais vu passer en caisse, celui-là. Lui parle pas.")],
  shopperStopped: [
    S("(chuchote) …t'entends plus les roulettes ? Il s'est arrêté. Bouge pas. Non… recule. Doucement."),
    S("(chuchote) Les néons, Farid… s'ils virent à l'orange, c'est qu'il est avec toi. Cours pas. Surtout cours pas."),
  ],
  footsteps: [S("Y'a quelqu'un dans le local technique. Juste à côté de moi. Ça marche… en rond. Toujours pareil. Toujours le même rythme.")],
  rayon9: [S("Farid… y'a un rayon 9 ? Y'a jamais eu de rayon 9 ici. Y'a huit rayons. J'y travaille depuis six ans.")],
  late: [S("J'ai… froid. Farid. Ma lampe… elle baisse. Dépêche.")],
  veryLate: [S("…Farid…")],

  knockedFromInside: [
    S("C'est toi ?! Farid ! Je t'entends ! Ouvre !", "direct"),
    S("Farid… t'es là ? Dis-moi que c'est toi derrière la porte.", "direct"),
  ],

  phase1: [
    S("Les caméras, Farid. Au poste. Elles voient tout… mais j'ai l'impression qu'elles sont en retard."),
    S("Si tu te perds, reviens à l'entrée. Le plan, lui, il change pas."),
    S("Je compte les cartons pour pas paniquer. Cent douze. Cent treize."),
    S("Mon téléphone capte pas. Y'a que le talkie. Parle-moi, s'il te plaît."),
    S("Tu sais ce qui est bizarre ? La musique. Y'a une chanson que j'ai jamais entendue."),
  ],
  phase2: [
    S("Farid… si tu t'arrêtes trop longtemps quelque part… tout bouge autour. Je crois. J'entends les étagères."),
    S("Les pas à côté… ils s'arrêtent pas. Un, deux, trois, quatre. Et ça recommence."),
    S("J'ai mis tous les cartons autour de moi. Ça tient un peu chaud. Un peu."),
    S("Me laisse pas là. S'il te plaît."),
  ],
  phase3: [S("…bouge… t'arrête pas…"), S("…froid… trop…"), S("…Farid… vite…"), S("…j'entends plus… mes doigts…")],

  callFarid: [F("Sabine, tu m'entends ?"), F("Sabine ? Réponds."), F("Sabine, c'est moi. Tu tiens le coup ?")],
  callBeforeNear: [S("Je suis juste là, Farid. T'as pas besoin du talkie, je te vois.", "direct")],
  callBefore: [S("Quoi ? Je suis à la caisse 1. Viens si t'as un souci. Et ramène un café.")],
  callWalking: [S("Je suis en route pour la chambre froide ! Deux minutes, je te dis.")],
  callDanger: [S("(chuchote) Il est là ? Bouge plus… non, recule. Doucement. Cours pas.")],
  callNoPhoto: [S("Le plan… à l'entrée, à gauche des portes. Prends-le en photo. Les rayons sont plus à leur place, je te jure.")],
  callAtDoor: [S("T'es là ?! Le verrou… il est vissé dehors. Aucune clé va marcher. Faut trouver un double. Momo, le boucher, il planque tout dans sa caisse.", "direct")],
  callFarAway: [S("La chambre froide, c'est par la réserve, tout au fond du magasin. La double porte. Fais vite.")],
  callGeneric: [
    S("Continue. Me laisse pas. Et reste pas planté au même endroit."),
    S("Les caméras… elles montrent ce qui s'est passé avant. Compare avec ta montre."),
    S("Les néons blancs, c'est bon. Orange… c'est pas bon."),
  ],

  innerEntranceBefore: [P("Ma ronde est pas finie. Et Sabine me tuerait.")],
  innerEntranceAfter: [P("Je peux pas partir sans Sabine.")],
  innerEmergencyFirst: [P("…J'étais pas de l'autre côté du magasin, là ?")],
  innerEmergencyAgain: [P("Encore. Le magasin veut pas que je sorte.")],
  innerColdDoorLocked: [P("Un verrou tout neuf. Les vis brillent encore.")],
} satisfies Record<string, Line[]>;

/**
 * Abîme une réplique selon la faiblesse de Sabine (0 = en forme, 1 = à bout) :
 * pauses, mots perdus, fins de phrase qui s'effacent.
 */
export function degrade(text: string, weakness: number, rng: Rng): string {
  if (weakness < 0.3) return text;
  const words = text.split(" ");
  const drop = weakness < 0.6 ? 0.08 : weakness < 0.85 ? 0.25 : 0.5;
  const out: string[] = [];
  for (const w of words) {
    if (rng.chance(drop)) {
      if (out[out.length - 1] !== "…") out.push("…");
      continue;
    }
    out.push(w);
  }
  let result = out.join(" ").replace(/ …/g, "…").replace(/\.\s/g, "… ");
  if (weakness > 0.75 && out.length > 6) result = out.slice(0, 6).join(" ") + "…";
  return result;
}

/** Une réplique d'un groupe, sans répéter les dernières. */
export class LinePicker {
  private readonly used = new Map<string, number[]>();

  constructor(private readonly rng: Rng) {}

  pick(key: string, pool: readonly Line[]): Line {
    const used = this.used.get(key) ?? [];
    let free = pool.map((_, i) => i).filter((i) => !used.includes(i));
    if (free.length === 0) {
      used.length = 0;
      free = pool.map((_, i) => i);
    }
    const i = this.rng.pick(free);
    used.push(i);
    this.used.set(key, used);
    return pool[i];
  }

  reset(): void {
    this.used.clear();
  }
}
