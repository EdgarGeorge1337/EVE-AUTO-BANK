# Janice API Research Summary

## Overview
Janice is a "space junk worth evaluator" API that provides pricing information for EVE Online items. The service is primarily focused on market data for in-game items.

## Base URL
```
https://janice.e-351.com/api/rest/
```

## Authentication
- **API Key Required**: Yes
- **Sample Key**: `G9KwKq3465588VPd6747t95Zh94q3W2E` (for testing only)
- **Personal Key**: Contact kukki#3914 for your own API key
- **Reason**: API keys are used to track usage and block excessive traffic

## Main Endpoint: Pricer

### Endpoint
```
POST /api/rest/v1/pricer?key={API_KEY}
```

### Request Format
- **Method**: POST
- **Content-Type**: `text/plain`
- **Body**: Item names separated by line breaks (`\r\n` or `\n`)

### Request Examples

#### Single Item
```
Tritanium
```

#### Multiple Items
```
Tritanium
Pyerite
Mexallon
```

### Response Format
Returns an array of objects, one for each item requested.

#### Response Structure
```json
[
  {
    "date": "2026-02-23T00:00:00Z",
    "market": {
      "id": 2,
      "name": "Jita 4-4"
    },
    "buyPriceMin": 0.07,
    "buyPriceAverage": 2.456785508681372,
    "buyPriceMedian": 3.02,
    "buyPriceStdDev": 1.4865168477304813,
    "buyPriceMax": 4,
    "buyOrderCount": 40,
    "buyVolume": 14620864411,
    "sellPriceMin": 4.17,
    "sellPriceAverage": 4.579578303509979,
    "sellPriceMedian": 4.4,
    "sellPriceStdDev": 0.5719635070326905,
    "sellPriceMax": 420,
    "sellOrderCount": 88,
    "sellVolume": 9879336842,
    "volume": 0.01,
    "splitPrice": 4.085,
    "itemType": {
      "eid": 34,
      "name": "Tritanium",
      "description": "The main building block in space structures...",
      "volume": 0.01,
      "packagedVolume": 0.01
    }
  }
]
```

#### Field Descriptions
- **date**: Date of the market data
- **market**: Market information (currently Jita 4-4)
- **buyPrice***: Various buy order statistics (min, average, median, std dev, max)
- **buyOrderCount**: Number of active buy orders
- **buyVolume**: Total volume in buy orders
- **sellPrice***: Various sell order statistics (min, average, median, std dev, max)
- **sellOrderCount**: Number of active sell orders
- **sellVolume**: Total volume in sell orders
- **volume**: Item volume
- **splitPrice**: Calculated split price
- **itemType**: Detailed item information including ID, name, description, and volumes

## Integration Examples

### PowerShell
```powershell
$body = "Tritanium`r`nPyerite"
$response = Invoke-RestMethod -Uri "https://janice.e-351.com/api/rest/v1/pricer?key=G9KwKq3465588VPd6747t95Zh94q3W2E" -Method Post -ContentType "text/plain" -Body $body
$response
```

### Excel Power Query
```powerquery
let 
    ItemList = "Compressed Spodumain#(cr)#(lf)Carbon#(cr)#(lf)Tritanium",
    RawData = Table.FromRecords(Json.Document(Web.Contents(
        "https://janice.e-351.com/api/rest/v1/pricer?key=G9KwKq3465588VPd6747t95Zh94q3W2E",
        [Headers = [#"Content-Type"="text/plain"], 
         Content = Text.ToBinary(ItemList)]
    ))),
    ExpandedMarket = Table.ExpandRecordColumn(RawData, "market", 
        {"id", "name"}, {"marketId", "marketName"}),
    ExpandedItemType = Table.ExpandRecordColumn(ExpandedMarket, "itemType", 
        {"eid", "name", "volume", "packagedVolume"}, 
        {"itemTypeEid", "itemTypeName", "itemTypeVolume", "itemTypePackagedVolume"})
in ExpandedItemType
```

### Google Sheets Script
The repository provides Google Sheets scripts (v1 and v2) that implement a `JANICE_PRICER` function.

## Documentation
- **Swagger UI**: https://janice.e-351.com/api/rest/docs/index.html
- **GitHub Repository**: https://github.com/E-351/janice
- **Sample Google Sheet**: https://docs.google.com/spreadsheets/d/1TPRhmsw77-vIO7QD-XlvCu9w0xzyk73iuGtto0SrQZE/edit?usp=sharing

## Usage Notes
1. **Rate Limiting**: Excessive traffic may result in blocking
2. **Market**: Currently appears to focus on Jita 4-4 market data
3. **Item Names**: Use exact item names as they appear in EVE Online
4. **Date Format**: ISO 8601 format for timestamps
5. **Volume**: Large numbers represent total volume in orders

## Error Handling
- Invalid item names will likely return no data or errors
- Missing/invalid API keys will result in authentication failures
- Network timeouts should be handled appropriately

## Applications
- Market analysis for EVE Online traders
- Inventory valuation
- Price tracking and alerts
- Spreadsheet-based market tools
- Automated trading bots (with caution regarding API terms)
