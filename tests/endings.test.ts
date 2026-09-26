import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/Rng";
import { badgeDate, badgeList, endingFor, hiddenEndingUnlocked } from "../src/narrative/Endings";
import { ButcherRegister, replayedDisplay } from "../src/systems/ButcherRegister";
import { ColdLock, LOCK_KEY, registerCode } from "../src/systems/ColdLock";
import { finalLayout } from "../src/world/ReshuffleSystem";
import { StoreLayout } from "../src/world/StoreLayout";

describe("Caisse de la boucherie", () => {
  it("le code est fixé par la graine (il ne change pas d'une boucle à l'autre)", () => {
    expect(registerCode(new Rng(3010))).toBe(registerCode(new Rng(3010)));
    expect(registerCode(new Rng(3010))).toMatch(/^[1-9]{4}$/);
  });

  it("s'ouvre avec le bon code, pas avec un autre", () => {
    const r = new ButcherRegister("4179");
    expect([..."417"].map((d) => r.press(d))).toEqual(["more", "more", "more"]);
    expect(r.display()).toBe("417-");
    expect(r.press("8")).toBe("wrong");
    expect(r.opened).toBe(false);
    expect([..."4179"].map((d) => r.press(d)).at(-1)).toBe("ok");
    expect(r.opened).toBe(true);
  });

  it("sur la caméra, les chiffres apparaissent un par un", () => {
    expect(replayedDisplay("4179", 0.1)).toBe("----");
    expect(replayedDisplay("4179", 0.35)).toBe("4---");
    expect(replayedDisplay("4179", 0.95)).toBe("4179");
    expect(replayedDisplay("4179", 1.2)).toBe("OUVERT");
  });
});

describe("Serrure de la chambre froide", () => {
  const has = (items: string[]) => (i: string) => items.includes(i);
  const TROUSSEAU = ["cle-technique", "cle-secours", "cle-securite", "cle-froide"];

  it("aucune clé du trousseau ne rentre dans le verrou neuf", () => {
    const lock = new ColdLock(new Rng(1));
    expect(lock.attempt(has(TROUSSEAU)).result).toBe("no-double");
  });

  it("avec le double en poche, elle change dès qu'on ne la regarde pas… et jamais sous nos yeux", () => {
    const lock = new ColdLock(new Rng(1));
    expect(lock.update(0.1, 0, true, true)).toBe(false);
    expect(lock.look).toBe("verrou");
    expect(lock.update(0.1, 0, true, false)).toBe(true);
    expect(lock.look).toBe("technique");
  });

  it("la bonne clé ne marche que si on n'a pas stagné dans les 30 dernières secondes", () => {
    const lock = new ColdLock(new Rng(1));
    lock.update(0.1, 0, true, false);
    // Il vient de taper le code à la caisse (stagnation), puis marche 15 s jusqu'à la porte.
    lock.update(0.1, 5, true, false);
    for (let t = 0; t < 15; t += 0.1) lock.update(0.1, 0, true, true);
    expect(lock.attempt(has(TROUSSEAU)).result).toBe("changed");
    expect(lock.attempt(has(TROUSSEAU)).result).toBe("wrong-moment");
    // Elle change encore, mais seulement quand on détourne les yeux.
    const before = lock.look;
    lock.update(0.1, 0, true, true);
    expect(lock.look).toBe(before);
    lock.update(0.1, 0, true, false);
    expect(lock.look).not.toBe(before);
    // Il revient « direct » : 31 s sans s'arrêter.
    for (let t = 0; t < 31; t += 0.1) lock.update(0.1, 0.5, true, false);
    expect(lock.attempt(has(TROUSSEAU)).result).toBe("changed");
    const r = lock.attempt(has(TROUSSEAU));
    expect(r.result).toBe("open");
    expect(lock.open).toBe(true);
  });

  it("chaque serrure correspond à une clé du trousseau", () => {
    for (const key of Object.values(LOCK_KEY)) expect(["cle-technique", "cle-secours", "cle-securite"]).toContain(key);
  });
});

describe("Redessin final", () => {
  it("un chemin d'emplacements reste comme sur le plan, tous les autres changent", () => {
    const layout = new StoreLayout();
    for (let seed = 1; seed <= 30; seed++) {
      const current = [...layout.initialAssignment];
      // Un magasin déjà un peu mélangé, rayon 9 compris.
      [current[0], current[4]] = [current[4], current[0]];
      current[8] = 9;
      const { target, stable } = finalLayout(current, layout.initialAssignment, new Rng(seed));
      expect([...target].sort()).toEqual([...current].sort());
      expect(stable).toHaveLength(3);
      // Un emplacement par rangée, du fond vers l'entrée, en ne se décalant que d'une colonne.
      expect(stable.map((s) => Math.floor(s / 3))).toEqual([2, 1, 0]);
      for (let i = 0; i + 1 < stable.length; i++) expect(Math.abs((stable[i] % 3) - (stable[i + 1] % 3))).toBeLessThanOrEqual(1);
      for (let s = 0; s < 9; s++) {
        if (stable.includes(s)) expect(target[s]).toBe(layout.initialAssignment[s]);
        else expect(target[s]).not.toBe(layout.initialAssignment[s]);
      }
    }
  });
});

describe("Fins", () => {
  it("sauvée si Farid la porte (ou est sorti avec elle), le froid sinon", () => {
    expect(endingFor({ carried: true, exited: false })).toBe("sauvee");
    expect(endingFor({ carried: true, exited: true })).toBe("sauvee");
    expect(endingFor({ carried: false, exited: false })).toBe("froid");
  });

  it("la fin cachée demande les deux indices", () => {
    expect(hiddenEndingUnlocked(new Set(["client-objectif"]))).toBe(false);
    expect(hiddenEndingUnlocked(new Set(["badges-farid"]))).toBe(false);
    expect(hiddenEndingUnlocked(new Set(["client-objectif", "badges-farid"]))).toBe(true);
  });

  it("la pile de badges grossit à chaque boucle, avec un badge de Farid daté de son embauche", () => {
    expect(badgeDate(0)).toBe("10/10");
    const first = badgeList(0).filter((b) => b.includes("FARID"));
    expect(first).toEqual([`!FARID · agent de sécurité · depuis le 10/10`]);
    expect(badgeList(2).filter((b) => b.includes("FARID"))).toHaveLength(3);
  });
});
