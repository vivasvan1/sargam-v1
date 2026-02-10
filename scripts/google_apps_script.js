// 1. Create a new Google Sheet
// 2. Extensions > Apps Script
// 3. Paste this code
// 4. Deploy > New Deployment > Web App
//    - Description: "Sargam Registry"
//    - Execute as: "Me"
//    - Who has access: "Anyone" (IMPORTANT)
// 5. Copy the "Web App URL" and use it in the Sargam app settings

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // Assuming headers are in row 1: ID, Name, Author, Description, Date
  var headers = data[0];
  var rows = data.slice(1);

  var result = rows.map(function (row) {
    return {
      id: row[0],
      name: row[1],
      author: row[2],
      description: row[3],
      date: row[4],
    };
  });

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents);

    // Validation
    if (!payload.id || !payload.name) {
      throw new Error('Missing required fields');
    }

    // Check for duplicates (simple check by ID)
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.id) {
        // Update existing
        sheet
          .getRange(i + 1, 1, 1, 5)
          .setValues([
            [
              payload.id,
              payload.name,
              payload.author || 'Anonymous',
              payload.description || '',
              new Date(),
            ],
          ]);
        return ContentService.createTextOutput(
          JSON.stringify({ status: 'updated', id: payload.id })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Add new row
    sheet.appendRow([
      payload.id,
      payload.name,
      payload.author || 'Anonymous',
      payload.description || '',
      new Date(),
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', id: payload.id })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
