// 1. Create a new Google Sheet
// 2. Extensions > Apps Script
// 3. Paste this code
// 4. Deploy > New Deployment > Web App
//    - Description: "Sargam Registry"
//    - Execute as: "Me"
//    - Who has access: "Anyone" (IMPORTANT)
// 5. Create/keep two sheets:
//    - Registry: ID, Name, Author, Description, Date, OwnerEmail
//    - Content: ID, ChunkIndex, ChunkText, UpdatedAt
// 6. Copy the "Web App URL" and use it in the Sargam app settings

var REGISTRY_SHEET_NAME = "Registry";
var CONTENT_SHEET_NAME = "Content";
var CONTENT_CHUNK_SIZE = 40000;

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function getRegistrySheet_() {
  return getOrCreateSheet_(REGISTRY_SHEET_NAME, [
    "ID",
    "Name",
    "Author",
    "Description",
    "Date",
    "OwnerEmail",
  ]);
}

function getContentSheet_() {
  return getOrCreateSheet_(CONTENT_SHEET_NAME, [
    "ID",
    "ChunkIndex",
    "ChunkText",
    "UpdatedAt",
  ]);
}

function registryEntryFromRow_(row) {
  return {
    id: row[0],
    name: row[1],
    author: row[2],
    description: row[3],
    date: row[4],
    ownerEmail: row[5] || "",
  };
}

function findRegistryRow_(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return { rowNumber: i + 1, row: data[i] };
    }
  }
  return null;
}

function getNotebookContent_(id) {
  var sheet = getContentSheet_();
  var data = sheet.getDataRange().getValues();
  var chunks = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      chunks.push({
        index: Number(data[i][1]),
        text: data[i][2] || "",
      });
    }
  }

  chunks.sort(function (a, b) {
    return a.index - b.index;
  });

  if (chunks.length === 0) {
    return null;
  }

  return chunks
    .map(function (chunk) {
      return chunk.text;
    })
    .join("");
}

function replaceNotebookContent_(id, content) {
  var sheet = getContentSheet_();
  var data = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
    }
  }

  var rows = [];
  var now = new Date();
  for (var offset = 0; offset < content.length; offset += CONTENT_CHUNK_SIZE) {
    rows.push([
      id,
      rows.length,
      content.slice(offset, offset + CONTENT_CHUNK_SIZE),
      now,
    ]);
  }

  if (rows.length === 0) {
    rows.push([id, 0, "", now]);
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
}

function deleteNotebookContent_(id) {
  var sheet = getContentSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
    }
  }
}

function doGet(e) {
  var registrySheet = getRegistrySheet_();

  if (e.parameter.action === "open") {
    var id = e.parameter.id || "";
    var match = findRegistryRow_(registrySheet, id);
    if (!match) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "not_found" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var content = getNotebookContent_(id);
    if (content === null) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "not_found" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        entry: registryEntryFromRow_(match.row),
        notebook: JSON.parse(content),
      }),
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var data = registrySheet.getDataRange().getValues();
  var rows = data.slice(1);

  var rawQuery = e.parameter.q ? e.parameter.q : "";
  var query = rawQuery.toLowerCase();
  var page = parseInt(e.parameter.page || "1", 10);
  var pageSize = parseInt(e.parameter.pageSize || "10", 10);

  var filteredRows = rows.filter(function (row) {
    if (!query) return true;
    var id = (row[0] || "").toString();
    var name = (row[1] || "").toString().toLowerCase();
    var author = (row[2] || "").toString().toLowerCase();

    return (
      id === rawQuery ||
      name.indexOf(query) !== -1 ||
      author.indexOf(query) !== -1
    );
  });

  var total = filteredRows.length;
  var start = (page - 1) * pageSize;
  var paginatedRows = filteredRows.slice(start, start + pageSize);

  return ContentService.createTextOutput(
    JSON.stringify({
      total: total,
      files: paginatedRows.map(registryEntryFromRow_),
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var registrySheet = getRegistrySheet_();
    var payload = JSON.parse(e.postData.contents);

    if (!payload.id) {
      throw new Error("Missing required field: id");
    }

    if (payload.action === "unpublish") {
      var match = findRegistryRow_(registrySheet, payload.id);
      if (match) {
        registrySheet.deleteRow(match.rowNumber);
        deleteNotebookContent_(payload.id);
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            action: "unpublish",
            id: payload.id,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
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
    if (typeof payload.content !== "string") {
      throw new Error("Missing required field: content");
    }

    var row = [
      payload.id,
      payload.name,
      payload.author || "Anonymous",
      payload.description || "",
      new Date(),
      payload.ownerEmail || "",
    ];

    var existing = findRegistryRow_(registrySheet, payload.id);
    if (existing) {
      registrySheet.getRange(existing.rowNumber, 1, 1, 6).setValues([row]);
    } else {
      registrySheet.appendRow(row);
    }

    replaceNotebookContent_(payload.id, payload.content);

    return ContentService.createTextOutput(
      JSON.stringify({ status: existing ? "updated" : "success", id: payload.id }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
