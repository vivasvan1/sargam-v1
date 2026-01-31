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
  var rows = data.slice(1);

  var rawQuery = e.parameter.q ? e.parameter.q : "";
  var query = rawQuery.toLowerCase();
  var page = parseInt(e.parameter.page || "1");
  var pageSize = parseInt(e.parameter.pageSize || "10");

  var filteredRows = rows.filter(function (row) {
    if (!query) return true;
    var id = (row[0] || "").toString();
    var name = (row[1] || "").toString().toLowerCase();
    var author = (row[2] || "").toString().toLowerCase();

    // Check for exact ID match (case-sensitive) OR partial match on name/author
    return (
      id === rawQuery ||
      name.indexOf(query) !== -1 ||
      author.indexOf(query) !== -1
    );
  });

  var total = filteredRows.length;
  var start = (page - 1) * pageSize;
  var paginatedRows = filteredRows.slice(start, start + pageSize);

  var files = paginatedRows.map(function (row) {
    return {
      id: row[0],
      name: row[1],
      author: row[2],
      description: row[3],
      date: row[4],
    };
  });

  var result = {
    total: total,
    files: files,
  };

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents);

    // Validation
    if (!payload.id) {
      throw new Error("Missing required field: id");
    }

    // Check for unpublish action
    if (payload.action === "unpublish") {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === payload.id) {
          sheet.deleteRow(i + 1);
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "success",
              action: "unpublish",
              id: payload.id,
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "not_found",
          message: "File not found in registry",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (!payload.name) {
      throw new Error("Missing required field: name");
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
              payload.author || "Anonymous",
              payload.description || "",
              new Date(),
            ],
          ]);
        return ContentService.createTextOutput(
          JSON.stringify({ status: "updated", id: payload.id }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Add new row
    sheet.appendRow([
      payload.id,
      payload.name,
      payload.author || "Anonymous",
      payload.description || "",
      new Date(),
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", id: payload.id }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
