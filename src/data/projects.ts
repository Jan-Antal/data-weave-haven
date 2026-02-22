export type ProjectStatus = 
  | "Příprava" 
  | "Engineering" 
  | "TPV" 
  | "Výroba IN" 
  | "Expedice" 
  | "Montáž" 
  | "Fakturace" 
  | "Dokončeno";

export type RiskLevel = "Low" | "Medium" | "High";

export interface ProjectInfo {
  id: string;
  projectId: string;
  projectName: string;
  klient: string;
  architekt: string;
  kalkulant: string;
  pm: string;
  konstrukter: string;
  status: ProjectStatus;
  datumObjednavky: string;
  datumSmluvni: string;
  currency: "CZK" | "EUR";
  prodejniCena: number;
  material: number | null;
  vyroba: number | null;
  tpv: number | null;
  subdodavky: number | null;
  dm: string;
  marze: string;
  fakturace: string;
  linkCN: string;
  active: boolean;
}

export interface PMStatus {
  projectId: string;
  projectName: string;
  klient: string;
  architekt: string;
  kalkulant: string;
  konstrukter: string;
  pm: string;
  status: ProjectStatus;
  riskLevel: RiskLevel;
  datumObjednavky: string;
  datumSmluvni: string;
  datumZamereni: string;
  datumTPV: string;
  datumExpedice: string;
  datumPredani: string;
  poznamka: string;
  prodejniCena: number;
  marze: string;
  fakturace: string;
}

export interface TPVStatus {
  projectId: string;
  projectName: string;
  pm: string;
  klient: string;
  konstrukter: string;
  narocnost: "Low" | "Medium" | "High" | "";
  velikostZakazky: string;
  hodinyTPV: string;
  percentStatus: number;
  status: ProjectStatus | "";
  riskLevel: RiskLevel | "";
  datumZamereni: string;
  datumTPV: string;
  poznamka: string;
}

export const projectInfoData: ProjectInfo[] = [
  { id: "1", projectId: "Z-2501-007", projectName: "UPD", klient: "Arkhe", architekt: "Perspektiv", kalkulant: "Kateřina Fojtů", pm: "Josef Heidinger", konstrukter: "Michaela Navrátilová", status: "Výroba IN", datumObjednavky: "", datumSmluvni: "2/27/26", currency: "CZK", prodejniCena: 2316635, material: null, vyroba: 787656, tpv: null, subdodavky: null, dm: "", marze: "30%", fakturace: "40%", linkCN: "", active: true },
  { id: "2", projectId: "Z-2518_001", projectName: "Breiteneckergasse Vídeň", klient: "WhyNot", architekt: "", kalkulant: "Kateřina Fojtů", pm: "Michal Konečný", konstrukter: "Michaela Navrátilová", status: "Příprava", datumObjednavky: "", datumSmluvni: "2/27/26", currency: "EUR", prodejniCena: 35529, material: null, vyroba: 375200, tpv: null, subdodavky: null, dm: "", marze: "21%", fakturace: "0%", linkCN: "", active: true },
  { id: "3", projectId: "Z-2520-001", projectName: "Hotel Mercur Salzburg", klient: "WhyNot", architekt: "", kalkulant: "Josef Heidinger", pm: "Josef Heidinger", konstrukter: "Karel Mayer", status: "Výroba IN", datumObjednavky: "", datumSmluvni: "2/28/26", currency: "EUR", prodejniCena: 82930, material: null, vyroba: 684921, tpv: null, subdodavky: null, dm: "", marze: "40%", fakturace: "60%", linkCN: "", active: true },
  { id: "4", projectId: "Z-2514-002", projectName: "ČSOB Zlín 2.NP", klient: "L-interiér", architekt: "", kalkulant: "Kateřina Fojtů", pm: "Michal Konečný", konstrukter: "", status: "Výroba IN", datumObjednavky: "", datumSmluvni: "3/15/26", currency: "CZK", prodejniCena: 735071, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "bez montáže", marze: "25%", fakturace: "0%", linkCN: "", active: true },
  { id: "5", projectId: "Z-2504-019", projectName: "Příluky Valovi Dům", klient: "Valovi (soukromý investor)", architekt: "", kalkulant: "Michal Konečný", pm: "Michal Konečný", konstrukter: "Jaroslav Rehorek ext", status: "Engineering", datumObjednavky: "", datumSmluvni: "", currency: "CZK", prodejniCena: 600000, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "", marze: "", fakturace: "0%", linkCN: "", active: true },
  { id: "6", projectId: "Z-2519-002", projectName: "Chata Modra 1.NP", klient: "WhyNot", architekt: "", kalkulant: "Dominik Spisiak, Michal Konečný", pm: "Michal Konečný", konstrukter: "Karel Mayer", status: "Příprava", datumObjednavky: "", datumSmluvni: "1/31/26", currency: "CZK", prodejniCena: 722768, material: null, vyroba: 245741, tpv: null, subdodavky: null, dm: "", marze: "30%", fakturace: "0%", linkCN: "", active: true },
  { id: "7", projectId: "Z-2603-001", projectName: "Byt AEC", klient: "Adam Enenkel", architekt: "", kalkulant: "Kateřina Fojtů", pm: "Aleš Macháček", konstrukter: "Karel Mayer", status: "TPV", datumObjednavky: "", datumSmluvni: "2/27/26", currency: "CZK", prodejniCena: 223144, material: null, vyroba: 75869, tpv: null, subdodavky: null, dm: "", marze: "10%", fakturace: "0%", linkCN: "", active: true },
  { id: "8", projectId: "Z-2601-001", projectName: "Galerie Butovice", klient: "Arkhe", architekt: "", kalkulant: "Aleš Macháček", pm: "Aleš Macháček", konstrukter: "Michaela Navrátilová", status: "TPV", datumObjednavky: "", datumSmluvni: "3/20/26", currency: "CZK", prodejniCena: 482578, material: null, vyroba: null, tpv: null, subdodavky: 47500, dm: "", marze: "", fakturace: "40%", linkCN: "", active: true },
  { id: "9", projectId: "Z-2515-001", projectName: "RD Cigánkovi Zlín", klient: "Cigánkovi", architekt: "", kalkulant: "Michal Konečný", pm: "Michal Konečný", konstrukter: "", status: "Výroba IN", datumObjednavky: "", datumSmluvni: "4/10/26", currency: "CZK", prodejniCena: 2233699, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "", marze: "25%", fakturace: "60%", linkCN: "", active: true },
  { id: "10", projectId: "Z-2512-001", projectName: "Gradus Kampa", klient: "Gradus", architekt: "", kalkulant: "Kateřina Fojtů", pm: "Josef Heidinger", konstrukter: "Karel Mayer", status: "Engineering", datumObjednavky: "", datumSmluvni: "2/16/26", currency: "CZK", prodejniCena: 2338572, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "", marze: "25%", fakturace: "60%", linkCN: "", active: true },
  { id: "11", projectId: "Z-2507-008", projectName: "Štepánska", klient: "Brick", architekt: "", kalkulant: "Josef Heidinger", pm: "Josef Heidinger", konstrukter: "", status: "Fakturace", datumObjednavky: "", datumSmluvni: "12/19/25", currency: "CZK", prodejniCena: 1677500, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "", marze: "35%", fakturace: "90%", linkCN: "", active: true },
  { id: "12", projectId: "Z-2519-001", projectName: "Chata Modra 1.PP", klient: "WhyNot", architekt: "", kalkulant: "Michal Konečný, Kateřina Fojtů", pm: "Michal Konečný", konstrukter: "Karel Mayer", status: "Výroba IN", datumObjednavky: "", datumSmluvni: "3/31/26", currency: "CZK", prodejniCena: 1730913, material: null, vyroba: null, tpv: null, subdodavky: null, dm: "", marze: "30%", fakturace: "70%", linkCN: "", active: true },
];

export const pmStatusData: PMStatus[] = [
  { projectId: "Z-2501-007", projectName: "UPD", klient: "Arkhe", architekt: "Perspektiv", kalkulant: "Kateřina Fojtů", konstrukter: "Michaela Navrátilová", pm: "Josef Heidinger", status: "Montáž", riskLevel: "High", datumObjednavky: "", datumSmluvni: "1/31/26", datumZamereni: "", datumTPV: "", datumExpedice: "2/16/26", datumPredani: "2/27/26", poznamka: "", prodejniCena: 2316635, marze: "30%", fakturace: "40%" },
  { projectId: "Z-2518_001", projectName: "Breiteneckergasse Vídeň", klient: "WhyNot", architekt: "", kalkulant: "Kateřina Fojtů", konstrukter: "Michaela Navrátilová", pm: "Michal Konečný", status: "Příprava", riskLevel: "Low", datumObjednavky: "10/10/25", datumSmluvni: "4/17/26", datumZamereni: "12/4/25", datumTPV: "", datumExpedice: "", datumPredani: "", poznamka: "Zakázka pozastavena ze strany objednatele.", prodejniCena: 35529, marze: "21%", fakturace: "" },
  { projectId: "Z-2520-001", projectName: "Hotel Mercur Salzburg", klient: "WhyNot", architekt: "", kalkulant: "Josef Heidinger", konstrukter: "Karel Mayer", pm: "Josef Heidinger", status: "Výroba IN", riskLevel: "Low", datumObjednavky: "", datumSmluvni: "2/28/26", datumZamereni: "", datumTPV: "", datumExpedice: "2/13/26", datumPredani: "", poznamka: "", prodejniCena: 82930, marze: "40%", fakturace: "60%" },
  { projectId: "Z-2514-002", projectName: "ČSOB Zlín 2.NP", klient: "L-interiér", architekt: "", kalkulant: "Kateřina Fojtů", konstrukter: "", pm: "Michal Konečný", status: "Výroba IN", riskLevel: "Low", datumObjednavky: "12/5/25", datumSmluvni: "4/24/26", datumZamereni: "1/19/26", datumTPV: "", datumExpedice: "3/9/26", datumPredani: "", poznamka: "plus víceprace cca 104 602,- Kč", prodejniCena: 735071, marze: "25%", fakturace: "" },
  { projectId: "Z-2504-019", projectName: "Příluky Valovi Dům", klient: "Valovi (soukromý investor)", architekt: "", kalkulant: "Michal Konečný", konstrukter: "Jaroslav Rehorek ext", pm: "Michal Konečný", status: "Engineering", riskLevel: "Low", datumObjednavky: "", datumSmluvni: "2/20/26", datumZamereni: "10/17/25", datumTPV: "", datumExpedice: "", datumPredani: "", poznamka: "řeší sa VD a CN sa doplní na základe VD", prodejniCena: 600000, marze: "", fakturace: "" },
  { projectId: "Z-2603-001", projectName: "Byt AEC", klient: "Adam Enenkel", architekt: "", kalkulant: "Kateřina Fojtů", konstrukter: "Karel Mayer", pm: "Aleš Macháček", status: "Výroba IN", riskLevel: "Low", datumObjednavky: "", datumSmluvni: "2/27/26", datumZamereni: "1/5/26", datumTPV: "2/5/26", datumExpedice: "", datumPredani: "", poznamka: "", prodejniCena: 223144, marze: "10%", fakturace: "" },
  { projectId: "Z-2515-001", projectName: "RD Cigánkovi Zlín", klient: "Cigánkovi", architekt: "", kalkulant: "Michal Konečný", konstrukter: "", pm: "Michal Konečný", status: "Výroba IN", riskLevel: "Low", datumObjednavky: "", datumSmluvni: "4/10/26", datumZamereni: "", datumTPV: "", datumExpedice: "3/20/26", datumPredani: "", poznamka: "M. Mrva provize 5%", prodejniCena: 2233699, marze: "25%", fakturace: "60%" },
  { projectId: "Z-2512-001", projectName: "Gradus Kampa", klient: "Gradus", architekt: "", kalkulant: "Kateřina Fojtů", konstrukter: "Karel Mayer", pm: "Josef Heidinger", status: "Engineering", riskLevel: "Low", datumObjednavky: "", datumSmluvni: "2/16/26", datumZamereni: "2/9/26", datumTPV: "", datumExpedice: "", datumPredani: "4/8/26", poznamka: "neni fixni termín, v závislosti od stavby", prodejniCena: 2338572, marze: "25%", fakturace: "60%" },
  { projectId: "Z-2501-004", projectName: "PTS II. Fišerovi", klient: "Fišerovi", architekt: "", kalkulant: "Kateřina Fojtů", konstrukter: "Denisa Vylítová", pm: "Aleš Macháček", status: "Expedice", riskLevel: "Medium", datumObjednavky: "", datumSmluvni: "2/13/26", datumZamereni: "", datumTPV: "", datumExpedice: "", datumPredani: "", poznamka: "", prodejniCena: 233381, marze: "5%", fakturace: "60%" },
  { projectId: "Z-2519-001", projectName: "Chata Modra 1.PP", klient: "WhyNot", architekt: "", kalkulant: "Michal Konečný, Kateřina Fojtů", konstrukter: "Karel Mayer", pm: "Michal Konečný", status: "Výroba IN", riskLevel: "Medium", datumObjednavky: "", datumSmluvni: "3/31/26", datumZamereni: "", datumTPV: "", datumExpedice: "3/23/26", datumPredani: "3/31/26", poznamka: "Reší se reklamace dveří / M.Ondreáš provize 3%", prodejniCena: 1730913, marze: "30%", fakturace: "70%" },
];

export const tpvStatusData: TPVStatus[] = [
  { projectId: "Z-2501-007", projectName: "UPD", pm: "Josef Heidinger", klient: "Arkhe", konstrukter: "Michaela Navrátilová", narocnost: "High", velikostZakazky: "", hodinyTPV: "50 H", percentStatus: 100, status: "Výroba IN", riskLevel: "High", datumZamereni: "", datumTPV: "", poznamka: "" },
  { projectId: "Z-2518_001", projectName: "Breiteneckergasse Vídeň", pm: "Michal Konečný", klient: "WhyNot", konstrukter: "Michaela Navrátilová", narocnost: "Medium", velikostZakazky: "", hodinyTPV: "", percentStatus: 0, status: "Příprava", riskLevel: "Medium", datumZamereni: "12/4/25", datumTPV: "", poznamka: "" },
  { projectId: "Z-2520-001", projectName: "Hotel Mercur Salzburg", pm: "Josef Heidinger", klient: "WhyNot", konstrukter: "Karel Mayer", narocnost: "Low", velikostZakazky: "", hodinyTPV: "", percentStatus: 100, status: "Výroba IN", riskLevel: "Low", datumZamereni: "", datumTPV: "", poznamka: "" },
  { projectId: "Z-2514-002", projectName: "ČSOB Zlín 2.NP", pm: "Michal Konečný", klient: "L-interiér", konstrukter: "", narocnost: "Medium", velikostZakazky: "", hodinyTPV: "", percentStatus: 100, status: "Výroba IN", riskLevel: "Low", datumZamereni: "1/19/26", datumTPV: "", poznamka: "" },
  { projectId: "Z-2504-019", projectName: "Příluky Valovi Dům", pm: "Michal Konečný", klient: "Valovi (soukromý investor)", konstrukter: "Jaroslav Rehorek ext", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 90, status: "Engineering", riskLevel: "Low", datumZamereni: "10/17/25", datumTPV: "", poznamka: "" },
  { projectId: "Z-2603-001", projectName: "Byt AEC", pm: "Aleš Macháček", klient: "Adam Enenkel", konstrukter: "Karel Mayer", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 70, status: "TPV", riskLevel: "Low", datumZamereni: "1/5/26", datumTPV: "2/5/26", poznamka: "" },
  { projectId: "Z-2601-001", projectName: "Galerie Butovice", pm: "Aleš Macháček", klient: "Arkhe", konstrukter: "Michaela Navrátilová", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 100, status: "TPV", riskLevel: "Low", datumZamereni: "1/15/26", datumTPV: "", poznamka: "" },
  { projectId: "Z-2515-001", projectName: "RD Cigánkovi Zlín", pm: "Michal Konečný", klient: "Cigánkovi", konstrukter: "", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 100, status: "Výroba IN", riskLevel: "Low", datumZamereni: "", datumTPV: "", poznamka: "" },
  { projectId: "Z-2607-005", projectName: "Scott Webber Pernerka", pm: "Josef Heidinger", klient: "Brick", konstrukter: "Michal Bernatík, Marek Ličman", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 100, status: "Výroba IN", riskLevel: "High", datumZamereni: "", datumTPV: "", poznamka: "" },
  { projectId: "Z-2607-004", projectName: "Štepánska 2. etapa", pm: "Josef Heidinger", klient: "Brick", konstrukter: "Michal Bernatík, Marek Ličman", narocnost: "", velikostZakazky: "", hodinyTPV: "", percentStatus: 90, status: "TPV", riskLevel: "Medium", datumZamereni: "", datumTPV: "", poznamka: "" },
  { projectId: "X6", projectName: "JAMF", pm: "", klient: "Arkhe", konstrukter: "Denisa Vylítová", narocnost: "Medium", velikostZakazky: "", hodinyTPV: "", percentStatus: 0, status: "Příprava", riskLevel: "Medium", datumZamereni: "3/20/26", datumTPV: "", poznamka: "" },
  { projectId: "X9", projectName: "Allianz 5.patro", pm: "Aleš Macháček", klient: "Arkhe", konstrukter: "Karel Mayer", narocnost: "Medium", velikostZakazky: "", hodinyTPV: "", percentStatus: 0, status: "Příprava", riskLevel: "High", datumZamereni: "", datumTPV: "", poznamka: "" },
];

export const statusOrder: ProjectStatus[] = [
  "Příprava",
  "Engineering", 
  "TPV",
  "Výroba IN",
  "Expedice",
  "Montáž",
  "Fakturace",
  "Dokončeno",
];
