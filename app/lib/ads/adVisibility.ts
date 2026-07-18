"use client";

type ViewerProfile = {
  country?: string | null;
  countryCode?: string | null;
  shipping_address?: {
    country?: string | null;
    countryCode?: string | null;
    country_code?: string | null;
  } | null;
  gender?: string | null;
  date_of_birth?: string | null;
  dob?: string | null;
};

const normalizeText = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const normalizeCode = (value: unknown) =>
  String(value ?? "").trim().toUpperCase();

const safeParse = (value: any) => {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

let regionNameToCodeCache: Map<string, string> | null = null;

const getRegionNameToCodeMap = () => {
  if (regionNameToCodeCache) return regionNameToCodeCache;

  const map = new Map<string, string>();

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    // NOTE: Intl.supportedValuesOf does NOT support "region" — calling it with
    // that key throws "RangeError: Invalid key". Always enumerate the ISO 3166-1
    // alpha-2 space (AA–ZZ) instead, mirroring the backend country-alias map, so
    // country NAMES (e.g. "Sri Lanka") map to CODES (e.g. "LK"). Without this the
    // map is empty and every country-targeted ad is hidden from name-format users.
    const supportedRegions = Array.from({ length: 26 * 26 }, (_, index) => {
      const first = String.fromCharCode(65 + Math.floor(index / 26));
      const second = String.fromCharCode(65 + (index % 26));
      return `${first}${second}`;
    });

    for (const code of supportedRegions) {
      const normalizedCode = normalizeCode(code);
      if (!normalizedCode) continue;
      map.set(normalizeText(normalizedCode), normalizedCode);

      const displayName = displayNames.of(normalizedCode);
      if (displayName) {
        map.set(normalizeText(displayName), normalizedCode);
      }
    }
  } catch {
    // Ignore Intl support gaps and fall back to direct string matching only.
  }

  regionNameToCodeCache = map;
  return map;
};

const getViewerCountryCandidates = (viewer: ViewerProfile | null | undefined) => {
  const rawValues = [
    viewer?.country,
    viewer?.countryCode,
    viewer?.shipping_address?.country,
    viewer?.shipping_address?.countryCode,
    viewer?.shipping_address?.country_code,
  ];

  const codeMap = getRegionNameToCodeMap();
  const candidates = new Set<string>();

  for (const rawValue of rawValues) {
    const normalizedValue = normalizeText(rawValue);
    const normalizedCode = normalizeCode(rawValue);
    if (normalizedValue) candidates.add(normalizedValue);
    if (normalizedCode) candidates.add(normalizeText(normalizedCode));

    const mappedCode = codeMap.get(normalizedValue);
    if (mappedCode) {
      candidates.add(normalizeText(mappedCode));
      const mappedName = new Intl.DisplayNames(["en"], { type: "region" }).of(mappedCode);
      if (mappedName) candidates.add(normalizeText(mappedName));
    }
  }

  return candidates;
};

const getViewerAge = (viewer: ViewerProfile | null | undefined) => {
  const rawDob = String(viewer?.date_of_birth || viewer?.dob || "").trim();
  if (!rawDob) return null;
  const slashMatch = rawDob.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const localeMatch = rawDob.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  let dob: Date;
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    dob = new Date(Number(year), Number(month) - 1, Number(day));
  } else if (localeMatch) {
    const [, first, second, year] = localeMatch;
    const firstNum = Number(first);
    const secondNum = Number(second);
    const month = firstNum > 12 ? secondNum : firstNum;
    const day = firstNum > 12 ? firstNum : secondNum;
    dob = new Date(Number(year), month - 1, day);
  } else {
    dob = new Date(rawDob);
  }

  if (!Number.isFinite(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const getAdDraft = (ad: any) => {
  const directDraft = safeParse(ad?.editDraft || ad?.edit_draft);
  const raw = ad?.raw?.raw || ad?.raw || {};
  const rawDraft = safeParse(raw?.editDraft || raw?.edit_draft);
  return directDraft || rawDraft || {};
};

const getTargetLocationCodes = (ad: any) => {
  const draft = getAdDraft(ad);
  const raw = ad?.raw?.raw || ad?.raw || {};
  const toArray = (bucket: any) => {
    if (Array.isArray(bucket)) return bucket;
    if (typeof bucket === "string") return bucket.split(",").map((part) => part.trim()).filter(Boolean);
    return bucket ? [bucket] : [];
  };
  const getLocationToken = (value: any) => {
    if (!value || typeof value !== "object") return value;
    return value.code
      || value.countryCode
      || value.country_code
      || value.value
      || value.label
      || value.name
      || value.country
      || "";
  };
  const valueBuckets = [
    ad?.selectedLocationCodes,
    ad?.selected_location_codes,
    ad?.locationCodes,
    ad?.location_codes,
    ad?.targetLocationCodes,
    ad?.target_location_codes,
    ad?.targetCountries,
    ad?.target_countries,
    ad?.countries,
    ad?.country,
    ad?.locations,
    ad?.selectedLocations,
    ad?.selected_locations,
    ad?.selectedLocationNames,
    ad?.selected_location_names,
    raw?.selectedLocationCodes,
    raw?.selected_location_codes,
    raw?.locationCodes,
    raw?.location_codes,
    raw?.targetLocationCodes,
    raw?.target_location_codes,
    raw?.targetCountries,
    raw?.target_countries,
    raw?.countries,
    raw?.country,
    raw?.locations,
    raw?.selectedLocations,
    raw?.selected_locations,
    raw?.selectedLocationNames,
    raw?.selected_location_names,
    draft?.selectedLocationCodes,
    draft?.selected_location_codes,
    draft?.locationCodes,
    draft?.location_codes,
    draft?.targetLocationCodes,
    draft?.target_location_codes,
    draft?.targetCountries,
    draft?.target_countries,
    draft?.countries,
    draft?.country,
    draft?.locations,
    draft?.selectedLocations,
    draft?.selected_locations,
    draft?.selectedLocationNames,
    draft?.selected_location_names,
  ];

  return valueBuckets
    .flatMap(toArray)
    .map(getLocationToken)
    .flatMap((value) => {
      const normalizedValue = normalizeText(value);
      const normalizedCode = normalizeCode(value);
      const mappedCode = getRegionNameToCodeMap().get(normalizedValue);
      return [normalizedValue, normalizeText(normalizedCode), normalizeText(mappedCode)].filter(Boolean);
    });
};

const getGenderTarget = (ad: any) => {
  const draft = getAdDraft(ad);
  const raw = ad?.raw?.raw || ad?.raw || {};
  return String(
    ad?.genderTarget
      || ad?.gender_target
      || ad?.targetGender
      || ad?.target_gender
      || ad?.selectedGender
      || ad?.selected_gender
      || ad?.gender
      || raw?.genderTarget
      || raw?.gender_target
      || raw?.targetGender
      || raw?.target_gender
      || raw?.selectedGender
      || raw?.selected_gender
      || raw?.gender
      || draft?.genderTarget
      || draft?.gender_target
      || draft?.targetGender
      || draft?.target_gender
      || draft?.selectedGender
      || draft?.selected_gender
      || draft?.gender
      || "All"
  ).trim();
};

const getAgeMin = (ad: any) => {
  const draft = getAdDraft(ad);
  const raw = ad?.raw?.raw || ad?.raw || {};
  const value = ad?.ageMin
    ?? ad?.age_min
    ?? ad?.targetAgeMin
    ?? ad?.target_age_min
    ?? ad?.ageRange?.min
    ?? ad?.age_range?.min
    ?? raw?.ageMin
    ?? raw?.age_min
    ?? raw?.targetAgeMin
    ?? raw?.target_age_min
    ?? raw?.ageRange?.min
    ?? raw?.age_range?.min
    ?? draft?.ageMin
    ?? draft?.age_min
    ?? draft?.targetAgeMin
    ?? draft?.target_age_min
    ?? draft?.ageRange?.min
    ?? draft?.age_range?.min;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAgeMax = (ad: any) => {
  const draft = getAdDraft(ad);
  const raw = ad?.raw?.raw || ad?.raw || {};
  const value = ad?.ageMax
    ?? ad?.age_max
    ?? ad?.targetAgeMax
    ?? ad?.target_age_max
    ?? ad?.ageRange?.max
    ?? ad?.age_range?.max
    ?? raw?.ageMax
    ?? raw?.age_max
    ?? raw?.targetAgeMax
    ?? raw?.target_age_max
    ?? raw?.ageRange?.max
    ?? raw?.age_range?.max
    ?? draft?.ageMax
    ?? draft?.age_max
    ?? draft?.targetAgeMax
    ?? draft?.target_age_max
    ?? draft?.ageRange?.max
    ?? draft?.age_range?.max;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function canViewerSeeAd(ad: any, viewer: ViewerProfile | null | undefined) {
  if (!ad || !viewer) return true;

  const targetLocations = getTargetLocationCodes(ad);
  if (targetLocations.length > 0) {
    const viewerCountries = getViewerCountryCandidates(viewer);
    if (viewerCountries.size === 0) return true;
    const hasLocationMatch = targetLocations.some((code) => viewerCountries.has(normalizeText(code)));
    if (!hasLocationMatch) return false;
  }

  const genderTarget = normalizeText(getGenderTarget(ad));
  if (genderTarget && genderTarget !== "all") {
    const viewerGender = normalizeText(viewer?.gender);
    if (!viewerGender || viewerGender !== genderTarget) return false;
  }

  const ageMin = getAgeMin(ad);
  const ageMax = getAgeMax(ad);
  const hasRealAgeRestriction = !(
    (ageMin === null || ageMin === 18) &&
    (ageMax === null || ageMax === 65)
  );

  if (hasRealAgeRestriction) {
    const viewerAge = getViewerAge(viewer);
    if (viewerAge === null) return true;
    if (ageMin !== null && viewerAge < ageMin) return false;
    if (ageMax !== null && viewerAge > ageMax) return false;
  }

  return true;
}

export function filterAdsForViewer<T>(ads: T[], viewer: ViewerProfile | null | undefined) {
  return ads.filter((ad) => canViewerSeeAd(ad, viewer));
}
