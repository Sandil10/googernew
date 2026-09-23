/// ISO 3166-1 alpha-2 country table for ad targeting.
///
/// The web builder fetches this from `restcountries.com` at runtime. Doing the
/// same on mobile would put a third-party network call in front of the location
/// picker, so the list is embedded instead. What matters for correctness is the
/// **code**: `GET /admin/customization/ad-allowed-countries` returns ISO-2
/// codes per ad type, and `POST /ads` stores the viewer-targeting codes, so the
/// name here is only ever a label.
library;

class AdCountry {
  final String code;
  final String name;
  const AdCountry(this.code, this.name);

  /// Regional-indicator pair — renders as the flag emoji on every platform the
  /// app ships to, which avoids bundling 250 flag images.
  String get flag {
    if (code.length != 2) return "";
    const base = 0x1F1E6;
    final upper = code.toUpperCase();
    return String.fromCharCodes([
      base + upper.codeUnitAt(0) - 0x41,
      base + upper.codeUnitAt(1) - 0x41,
    ]);
  }
}

String adCountryFlagFromCode(String code) {
  if (code.length != 2) return "";
  const base = 0x1F1E6;
  final upper = code.toUpperCase();
  return String.fromCharCodes([
    base + upper.codeUnitAt(0) - 0x41,
    base + upper.codeUnitAt(1) - 0x41,
  ]);
}

/// Alphabetical by name, which is the order the picker presents.
const List<AdCountry> adCountries = [
  AdCountry("AF", "Afghanistan"),
  AdCountry("AL", "Albania"),
  AdCountry("DZ", "Algeria"),
  AdCountry("AD", "Andorra"),
  AdCountry("AO", "Angola"),
  AdCountry("AG", "Antigua and Barbuda"),
  AdCountry("AR", "Argentina"),
  AdCountry("AM", "Armenia"),
  AdCountry("AU", "Australia"),
  AdCountry("AT", "Austria"),
  AdCountry("AZ", "Azerbaijan"),
  AdCountry("BS", "Bahamas"),
  AdCountry("BH", "Bahrain"),
  AdCountry("BD", "Bangladesh"),
  AdCountry("BB", "Barbados"),
  AdCountry("BY", "Belarus"),
  AdCountry("BE", "Belgium"),
  AdCountry("BZ", "Belize"),
  AdCountry("BJ", "Benin"),
  AdCountry("BT", "Bhutan"),
  AdCountry("BO", "Bolivia"),
  AdCountry("BA", "Bosnia and Herzegovina"),
  AdCountry("BW", "Botswana"),
  AdCountry("BR", "Brazil"),
  AdCountry("BN", "Brunei"),
  AdCountry("BG", "Bulgaria"),
  AdCountry("BF", "Burkina Faso"),
  AdCountry("BI", "Burundi"),
  AdCountry("KH", "Cambodia"),
  AdCountry("CM", "Cameroon"),
  AdCountry("CA", "Canada"),
  AdCountry("CV", "Cape Verde"),
  AdCountry("CF", "Central African Republic"),
  AdCountry("TD", "Chad"),
  AdCountry("CL", "Chile"),
  AdCountry("CN", "China"),
  AdCountry("CO", "Colombia"),
  AdCountry("KM", "Comoros"),
  AdCountry("CG", "Congo"),
  AdCountry("CD", "Congo (DRC)"),
  AdCountry("CR", "Costa Rica"),
  AdCountry("CI", "Côte d'Ivoire"),
  AdCountry("HR", "Croatia"),
  AdCountry("CU", "Cuba"),
  AdCountry("CY", "Cyprus"),
  AdCountry("CZ", "Czechia"),
  AdCountry("DK", "Denmark"),
  AdCountry("DJ", "Djibouti"),
  AdCountry("DM", "Dominica"),
  AdCountry("DO", "Dominican Republic"),
  AdCountry("EC", "Ecuador"),
  AdCountry("EG", "Egypt"),
  AdCountry("SV", "El Salvador"),
  AdCountry("GQ", "Equatorial Guinea"),
  AdCountry("ER", "Eritrea"),
  AdCountry("EE", "Estonia"),
  AdCountry("SZ", "Eswatini"),
  AdCountry("ET", "Ethiopia"),
  AdCountry("FJ", "Fiji"),
  AdCountry("FI", "Finland"),
  AdCountry("FR", "France"),
  AdCountry("GA", "Gabon"),
  AdCountry("GM", "Gambia"),
  AdCountry("GE", "Georgia"),
  AdCountry("DE", "Germany"),
  AdCountry("GH", "Ghana"),
  AdCountry("GR", "Greece"),
  AdCountry("GD", "Grenada"),
  AdCountry("GT", "Guatemala"),
  AdCountry("GN", "Guinea"),
  AdCountry("GW", "Guinea-Bissau"),
  AdCountry("GY", "Guyana"),
  AdCountry("HT", "Haiti"),
  AdCountry("HN", "Honduras"),
  AdCountry("HK", "Hong Kong"),
  AdCountry("HU", "Hungary"),
  AdCountry("IS", "Iceland"),
  AdCountry("IN", "India"),
  AdCountry("ID", "Indonesia"),
  AdCountry("IR", "Iran"),
  AdCountry("IQ", "Iraq"),
  AdCountry("IE", "Ireland"),
  AdCountry("IL", "Israel"),
  AdCountry("IT", "Italy"),
  AdCountry("JM", "Jamaica"),
  AdCountry("JP", "Japan"),
  AdCountry("JO", "Jordan"),
  AdCountry("KZ", "Kazakhstan"),
  AdCountry("KE", "Kenya"),
  AdCountry("KI", "Kiribati"),
  AdCountry("KW", "Kuwait"),
  AdCountry("KG", "Kyrgyzstan"),
  AdCountry("LA", "Laos"),
  AdCountry("LV", "Latvia"),
  AdCountry("LB", "Lebanon"),
  AdCountry("LS", "Lesotho"),
  AdCountry("LR", "Liberia"),
  AdCountry("LY", "Libya"),
  AdCountry("LI", "Liechtenstein"),
  AdCountry("LT", "Lithuania"),
  AdCountry("LU", "Luxembourg"),
  AdCountry("MO", "Macao"),
  AdCountry("MG", "Madagascar"),
  AdCountry("MW", "Malawi"),
  AdCountry("MY", "Malaysia"),
  AdCountry("MV", "Maldives"),
  AdCountry("ML", "Mali"),
  AdCountry("MT", "Malta"),
  AdCountry("MH", "Marshall Islands"),
  AdCountry("MR", "Mauritania"),
  AdCountry("MU", "Mauritius"),
  AdCountry("MX", "Mexico"),
  AdCountry("FM", "Micronesia"),
  AdCountry("MD", "Moldova"),
  AdCountry("MC", "Monaco"),
  AdCountry("MN", "Mongolia"),
  AdCountry("ME", "Montenegro"),
  AdCountry("MA", "Morocco"),
  AdCountry("MZ", "Mozambique"),
  AdCountry("MM", "Myanmar"),
  AdCountry("NA", "Namibia"),
  AdCountry("NR", "Nauru"),
  AdCountry("NP", "Nepal"),
  AdCountry("NL", "Netherlands"),
  AdCountry("NZ", "New Zealand"),
  AdCountry("NI", "Nicaragua"),
  AdCountry("NE", "Niger"),
  AdCountry("NG", "Nigeria"),
  AdCountry("KP", "North Korea"),
  AdCountry("MK", "North Macedonia"),
  AdCountry("NO", "Norway"),
  AdCountry("OM", "Oman"),
  AdCountry("PK", "Pakistan"),
  AdCountry("PW", "Palau"),
  AdCountry("PS", "Palestine"),
  AdCountry("PA", "Panama"),
  AdCountry("PG", "Papua New Guinea"),
  AdCountry("PY", "Paraguay"),
  AdCountry("PE", "Peru"),
  AdCountry("PH", "Philippines"),
  AdCountry("PL", "Poland"),
  AdCountry("PT", "Portugal"),
  AdCountry("PR", "Puerto Rico"),
  AdCountry("QA", "Qatar"),
  AdCountry("RO", "Romania"),
  AdCountry("RU", "Russia"),
  AdCountry("RW", "Rwanda"),
  AdCountry("KN", "Saint Kitts and Nevis"),
  AdCountry("LC", "Saint Lucia"),
  AdCountry("VC", "Saint Vincent and the Grenadines"),
  AdCountry("WS", "Samoa"),
  AdCountry("SM", "San Marino"),
  AdCountry("ST", "Sao Tome and Principe"),
  AdCountry("SA", "Saudi Arabia"),
  AdCountry("SN", "Senegal"),
  AdCountry("RS", "Serbia"),
  AdCountry("SC", "Seychelles"),
  AdCountry("SL", "Sierra Leone"),
  AdCountry("SG", "Singapore"),
  AdCountry("SK", "Slovakia"),
  AdCountry("SI", "Slovenia"),
  AdCountry("SB", "Solomon Islands"),
  AdCountry("SO", "Somalia"),
  AdCountry("ZA", "South Africa"),
  AdCountry("KR", "South Korea"),
  AdCountry("SS", "South Sudan"),
  AdCountry("ES", "Spain"),
  AdCountry("LK", "Sri Lanka"),
  AdCountry("SD", "Sudan"),
  AdCountry("SR", "Suriname"),
  AdCountry("SE", "Sweden"),
  AdCountry("CH", "Switzerland"),
  AdCountry("SY", "Syria"),
  AdCountry("TW", "Taiwan"),
  AdCountry("TJ", "Tajikistan"),
  AdCountry("TZ", "Tanzania"),
  AdCountry("TH", "Thailand"),
  AdCountry("TL", "Timor-Leste"),
  AdCountry("TG", "Togo"),
  AdCountry("TO", "Tonga"),
  AdCountry("TT", "Trinidad and Tobago"),
  AdCountry("TN", "Tunisia"),
  AdCountry("TR", "Türkiye"),
  AdCountry("TM", "Turkmenistan"),
  AdCountry("TV", "Tuvalu"),
  AdCountry("UG", "Uganda"),
  AdCountry("UA", "Ukraine"),
  AdCountry("AE", "United Arab Emirates"),
  AdCountry("GB", "United Kingdom"),
  AdCountry("US", "United States"),
  AdCountry("UY", "Uruguay"),
  AdCountry("UZ", "Uzbekistan"),
  AdCountry("VU", "Vanuatu"),
  AdCountry("VA", "Vatican City"),
  AdCountry("VE", "Venezuela"),
  AdCountry("VN", "Vietnam"),
  AdCountry("YE", "Yemen"),
  AdCountry("ZM", "Zambia"),
  AdCountry("ZW", "Zimbabwe"),
];

final Map<String, AdCountry> adCountriesByCode = {
  for (final country in adCountries) country.code: country,
};

final Map<String, AdCountry> adCountriesByName = {
  for (final country in adCountries) country.name.toLowerCase(): country,
};

String adCountryName(String code) =>
    adCountriesByCode[code.toUpperCase()]?.name ?? code;

String adCountryFlagByName(String name) =>
    adCountriesByName[name.trim().toLowerCase()]?.flag ?? "";

List<AdCountry> adCountriesFromApiRows(Iterable<dynamic> rows) {
  final parsed = rows
      .whereType<Map>()
      .map((row) {
        final code = '${row['code'] ?? ''}'.trim().toUpperCase();
        final name = '${row['name'] ?? ''}'.trim();
        if (code.length != 2 || name.isEmpty) return null;
        return AdCountry(code, name);
      })
      .whereType<AdCountry>()
      .toList(growable: false);
  if (parsed.isEmpty) return adCountries;
  final sorted = [...parsed]..sort((a, b) => a.name.compareTo(b.name));
  return sorted;
}
