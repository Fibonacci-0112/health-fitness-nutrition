/** Display conversions. Storage is always metric (kg, cm, g, ml). */

export const LB_PER_KG = 2.20462262185;
export const G_PER_OZ = 28.349523125;
export const ML_PER_FL_OZ_US = 29.5735295625;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const gToOz = (g: number) => g / G_PER_OZ;
export const ozToG = (oz: number) => oz * G_PER_OZ;
export const mlToFlOz = (ml: number) => ml / ML_PER_FL_OZ_US;
export const flOzToMl = (flOz: number) => flOz * ML_PER_FL_OZ_US;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
