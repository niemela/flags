# Flags Repository

A comprehensive collection of flag SVGs and metadata for countries, subdivisions, cities, organizations, and historical entities.

## Repository Structure

Each flag is represented by two files with matching base names in the `data/` directory:
- `data/{id}.svg` - The flag image in SVG format
- `data/{id}.json` - Metadata about the flag

## File Naming Convention

The naming follows a hierarchical pattern based on ISO standards with specific fallback rules:

### ISO Standard Priority

The naming convention strictly follows this hierarchy:

1. **[ISO 3166-1](https://en.wikipedia.org/wiki/ISO_3166-1) alpha-2** (uppercase) - For countries and exceptional reservations
2. **[ISO 3166-2](https://en.wikipedia.org/wiki/ISO_3166-2)** (uppercase) - For country subdivisions  
3. **[ISO 3166-3](https://en.wikipedia.org/wiki/ISO_3166-3)** (uppercase) - For formerly assigned country codes
4. **Custom naming** when no ISO codes exist

### Countries (ISO 3166-1)
- `SE.svg` / `SE.json` - Sweden
- `US.svg` / `US.json` - United States
- `FR.svg` / `FR.json` - France
- `EU.svg` / `EU.json` - European Union (exceptional reservation)
- `UN.svg` / `UN.json` - United Nations (exceptional reservation)

### Country Subdivisions (ISO 3166-2)
- `US-TX.svg` / `US-TX.json` - Texas (US state)
- `CA-ON.svg` / `CA-ON.json` - Ontario (Canadian province)
- `DE-BY.svg` / `DE-BY.json` - Bavaria (German state)
- `AU-NSW.svg` / `AU-NSW.json` - New South Wales (Australian state)

### Former Countries (ISO 3166-3)
- `ZRCD.svg` / `ZRCD.json` - Zaire (now Democratic Republic of the Congo)

### Cities and Local Entities
When no ISO code exists but there is a parent with an ISO code, use `<iso-code>-<lowercase-name>`:
- `SE-AB-stockholm.svg` / `SE-AB-stockholm.json` - Stockholm, Sweden
- `US-IL-chicago.svg` / `US-IL-chicago.json` - Chicago, Illinois, USA
- `FR-IDF-paris.svg` / `FR-IDF-paris.json` - Paris, France

### Organizations and Special Entities
When no ISO code exists and there is no parent with an ISO code, use `<lowercase-name>`:
- `nato.svg` / `nato.json` - NATO
- `olympic.svg` / `olympic.json` - Olympic Games
- `sapmi.svg` / `sapmi.json` - Sami people
- `meanmaa.svg` / `meanmaa.json` - Meänmaa
- `nordic.svg` / `nordic.json` - Nordic Council

### Historical Flags
For multiple versions of the same flag differing only by time period, append `_<period>`:
- `SE_1844-1905.svg` - Sweden (1844-1905)
- `US_1959-1960.svg` - United States (1959-1960, 49-star flag)
- `BY_1918_1991–1995.svg` - Belarus (1918, 1991-1995)
- `SUHH_1955-1991.svg` - Soviet Union (1955-1991)

## JSON Metadata Structure

Each JSON file contains the following fields:

```json
{
  "id": "SE",
  "name": "Sweden",
  "iso": "SE",
  "type": ["country"],
  "region": "Europe",
  "colors": ["blue", "yellow"],
  "features": ["cross", "nordic cross"],
  "description": "Blue field with yellow Nordic cross",
  "symbolism": "The blue represents justice, loyalty, and perseverance; the yellow represents generosity",
  "period": "1906-present"
}
```

### Field Descriptions

- **id**: Unique identifier matching the filename
- **name**: Display name of the entity
- **iso**: ISO code or identifier
- **type**: Array of entity types (see below)
- **region**: Geographic region
- **parent**: Parent entity ID (for subdivisions and cities)
- **colors**: Array of primary colors in the flag
- **features**: Array of design elements
- **description**: Brief visual description
- **symbolism**: Meaning and significance of the flag elements
- **period**: Time period when this flag was/is in use

### Type Values

- `"country"` - Sovereign nations
- `"subdivision"` - States, provinces, regions, territories, etc.
- `"city"` - Municipal flags
- `"intergovernmental"` - Organizations with countries as members (UN, EU, NATO)
- `"organization"` - Other organizations (Olympic Committee, etc.)
- `"ethnic"` - Flags representing ethnic groups or peoples
- `"historical"` - Defunct countries or historical versions
- `"proposed"` - Designed but never officially adopted

### Region Values

- `"Europe"`
- `"North America"`
- `"South America"`
- `"Asia"`
- `"Africa"`
- `"Oceania"`
- `"Antarctica"`

### Example: Subdivision (Texas)

```json
{
  "id": "US-TX",
  "name": "Texas",
  "iso": "US-TX",
  "type": ["subdivision"],
  "parent": "US",
  "region": "North America",
  "colors": ["blue", "white", "red"],
  "features": ["lone star"],
  "description": "Blue field with white five-pointed star and red and white stripes",
  "symbolism": "The blue represents loyalty, white represents purity, red represents bravery; the lone star represents unity",
  "period": "1845-present"
}
```

### Example: City (Stockholm)

```json
{
  "id": "SE-AB-stockholm",
  "name": "Stockholm",
  "iso": "SE-AB-stockholm", 
  "type": ["city"],
  "parent": "SE-AB",
  "region": "Europe",
  "colors": ["blue", "yellow"],
  "features": ["coat of arms"],
  "description": "Blue field with city coat of arms",
  "symbolism": "City coat of arms representing Stockholm's heritage",
  "period": "1960-present"
}
```

### Example: Historical Flag

```json
{
  "id": "SUHH_1955-1991",
  "name": "Soviet Union",
  "iso": "SU",
  "type": ["country", "historical"],
  "region": "Europe",
  "colors": ["red", "yellow"],
  "features": ["hammer and sickle", "star"],
  "description": "Red field with golden hammer and sickle and star",
  "symbolism": "Red represents revolution, hammer and sickle represent workers and peasants",
  "period": "1955-1991"
}
```

## Usage

The consistent naming structure allows for easy programmatic access:
- Given an ID like "US-TX", both `data/US-TX.svg` and `data/US-TX.json` can be reliably located
- The hierarchical naming reflects real-world administrative relationships
- Historical flags are clearly distinguished by time periods in their IDs

## Contributing

When adding new flags:
1. Follow the established naming conventions
2. Ensure both SVG and JSON files are created
3. Complete all required JSON fields
4. Use consistent color names and feature descriptions
