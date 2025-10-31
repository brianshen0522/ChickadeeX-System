//裝DICOM Tags設定檔的物件
var DicomTags = {};
//裝伺服器設定檔的物件
var ConfigLog = {};
//代表config檔已經載入完畢 --*
var configOnload = false;

window.onload = function () {
  //執行其他Script提供的高優先度onload函數
  onloadFunction.ExecuteFirst();
  //執行RWD
  //EnterRWD();
  //初始化參數
  loadLdcmview();
  //初始化HTML元素事件
  html_onload();
  //執行RWD
  EnterRWD();
  //執行其他Script提供的低優先度onload函數
  onloadFunction.ExecuteLast();
  onloadFunction.onloaded = true;
}

class OnloadFunction {
  constructor() {
    this.FisrtList = [];
    this.LastList = [];
    this.onloaded = false;
  }
  push(fun) {
    if (fun.constructor.name == 'Function') this.LastList.push(fun);
    else throw "not function";
    if (this.onloaded) fun();//若已經onload過了，就直接執行
  }
  push2First(fun) {
    if (fun.constructor.name == 'Function') this.FisrtList.push(fun);
    else throw "not function";
    if (this.onloaded) fun();
  }
  push2Last(fun) {
    if (fun.constructor.name == 'Function') this.LastList.push(fun);
    else throw "not function";
    if (this.onloaded) fun();
  }
  ExecuteFirst() {
    for (var fun of this.FisrtList) fun();
  }
  ExecuteLast() {
    for (var fun of this.LastList) fun();
  }
}
var onloadFunction = new OnloadFunction();

function loadLdcmview() {

  //隱藏一開始不需要的元素
  HideElemByID(["WindowLevelDiv", "labelZoom", "labelPlay", "textPlay", "textZoom", "MarkStyleDiv"/*, "GraphicStyleDiv"*/]);

  //初始化每一個Viewport的參數
  for (var i = 0; i < Viewport_Total; i++) {
    ViewPortList.push(new BlueLightViewPort(i));
  }
  initNewCanvas2();

  HideElemByID(["textWC", "textWW"]);

  //載入config檔的設定
  readDicomTags("../data/dicomTags.json", setLabelPadding);
  readConfigJson("../data/config.json", readAllJson, readJson);

  //設定icon邊框
  drawBorder(getByid("MouseOperation"));
  //顯示label
  displayAnnotation();
}

function getParameterByName(name) {
  name = name.replace(/\[\[]/g, "\\[").replace(/\[\]]/g, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  if (results == null) results = "";
  else results = decodeURIComponent(results[1].replace(/\+/g, " "));

  var pair1 = ("" + results).split(",");
  return pair1.slice();
}

function setLabelPadding() {
  labelPadding = isNaN(parseInt(DicomTags.labelPadding)) ? 5 : parseInt(DicomTags.labelPadding);
  leftLabelPadding = isNaN(parseInt(DicomTags.leftLabelPadding)) ? labelPadding : parseInt(DicomTags.leftLabelPadding);
  rightLabelPadding = isNaN(parseInt(DicomTags.rightLabelPadding)) ? labelPadding : parseInt(DicomTags.rightLabelPadding);
  topLabelPadding = isNaN(parseInt(DicomTags.topLabelPadding)) ? labelPadding : parseInt(DicomTags.topLabelPadding);
  bottomLabelPadding = isNaN(parseInt(DicomTags.bottomLabelPadding)) ? labelPadding : parseInt(DicomTags.bottomLabelPadding);
  document.documentElement.style.setProperty('--labelPadding', `${labelPadding}px`);
  document.documentElement.style.setProperty('--leftLabelPadding', `${leftLabelPadding}px`);
  document.documentElement.style.setProperty('--rightLabelPadding', `${rightLabelPadding}px`);
  document.documentElement.style.setProperty('--topLabelPadding', `${topLabelPadding}px`);
  document.documentElement.style.setProperty('--bottomLabelPadding', `${bottomLabelPadding}px`);
}

function readDicomTags(url, setLabelPadding) {
  //讀取DICOM Tags設定檔
  var request = new XMLHttpRequest();
  request.open('GET', url);
  request.responseType = 'text';
  var dicomtags = {};
  //LT代表left  top
  //RT代表right top
  //LB代表left  bottom
  //RB代表right bottom
  request.onload = function () {
    if (request.readyState != 4) { return; }
    var responseJson = JSON.parse(request.responseText);
    var DicomResponse = responseJson["default"];
    dicomtags.labelPadding = parseInt(DicomResponse["labelPadding"]) ? parseInt(DicomResponse["labelPadding"]) : 5;
    dicomtags.leftLabelPadding = parseInt(DicomResponse["leftLabelPadding"]) ? parseInt(DicomResponse["leftLabelPadding"]) : dicomtags.labelPadding;
    dicomtags.rightLabelPadding = parseInt(DicomResponse["rightLabelPadding"]) ? parseInt(DicomResponse["rightLabelPadding"]) : dicomtags.labelPadding;
    dicomtags.topLabelPadding = parseInt(DicomResponse["topLabelPadding"]) ? parseInt(DicomResponse["topLabelPadding"]) : dicomtags.labelPadding;
    dicomtags.bottomLabelPadding = parseInt(DicomResponse["bottomLabelPadding"]) ? parseInt(DicomResponse["bottomLabelPadding"]) : dicomtags.labelPadding;

    dicomtags.LT = {};
    dicomtags.LT.value = [];
    for (var i = 0; i < DicomResponse["LT"].length; i++) {
      dicomtags.LT.value.push(DicomResponse["LT"][i].value);
    }
    dicomtags.RT = {};
    dicomtags.RT.value = [];
    for (var i = 0; i < DicomResponse["RT"].length; i++) {
      dicomtags.RT.value.push(DicomResponse["RT"][i].value);
    }
    dicomtags.LB = {};
    dicomtags.LB.value = [];
    for (var i = 0; i < DicomResponse["LB"].length; i++) {
      dicomtags.LB.value.push(DicomResponse["LB"][i].value);
    }
    dicomtags.RB = {};
    dicomtags.RB.value = [];
    for (var i = 0; i < DicomResponse["RB"].length; i++) {
      dicomtags.RB.value.push(DicomResponse["RB"][i].value);
    }

    dicomtags.MT = {};
    dicomtags.MT.value = [];
    for (var i = 0; i < DicomResponse["MT"].length; i++) {
      dicomtags.MT.value.push(DicomResponse["MT"][i].value);
    }
    dicomtags.MB = {};
    dicomtags.MB.value = [];
    for (var i = 0; i < DicomResponse["MB"].length; i++) {
      dicomtags.MB.value.push(DicomResponse["MB"][i].value);
    }
    dicomtags.LM = {};
    dicomtags.LM.value = [];
    for (var i = 0; i < DicomResponse["LM"].length; i++) {
      dicomtags.LM.value.push(DicomResponse["LM"][i].value);
    }
    dicomtags.RM = {};
    dicomtags.RM.value = [];
    for (var i = 0; i < DicomResponse["RM"].length; i++) {
      dicomtags.RM.value.push(DicomResponse["RM"][i].value);
    }
    //指派至全域變數
    Object.assign(DicomTags, dicomtags);
    if (setLabelPadding) setLabelPadding();
  }
  request.send();
}

function operateQueryString(queryString) {
  var TAG_LIST = [];
  var NewQueryString = "";
  for (var key in TAG_DICT) { TAG_LIST.push(TAG_DICT[key]["name"]) };
  for (var i = 0; i < queryString.split("&").length; i++) {
    if (TAG_LIST.includes(queryString.split("&")[i].split("=")[0])) {
      if (i != 0) NewQueryString += "&";
      NewQueryString += queryString.split("&")[i];
    }
  }
  return NewQueryString;
}

function load_WebImg() {
  function getQueryVariable_WebImg(variable) {
    var query = location.search.substring(1);
    var vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split("=");
      if (pair[0] == variable) return pair[1];
    }
  }
  var webimgurl = getQueryVariable_WebImg("webimgurl");
  if (webimgurl) {
    try {
      loadPicture(decodeURIComponent(webimgurl));
    } catch (e) {
      console.error('Failed to load image via webimgurl:', e);
      loadPicture(webimgurl);
    }
  }
}

function createSeenTracker() {
  return Object.create(null);
}

function normalizeSourceUrl(value) {
  if (value == null) return null;
  let candidate = String(value).trim();
  if (!candidate) return null;
  if (/^(data:|blob:)/i.test(candidate)) {
    return candidate;
  }
  try {
    candidate = decodeURIComponent(candidate);
  } catch (_err) {
    // Ignore decode errors and use the original value
  }
  try {
    return new URL(candidate, window.location.origin).href;
  } catch (_err) {
    return candidate;
  }
}

function hasSeen(seen, key) {
  return !!(seen && key && seen[key]);
}

function registerSeen(seen, key) {
  if (seen && key) {
    seen[key] = true;
  }
}

function loadDicomSource(url, seen) {
  const resolved = normalizeSourceUrl(url);
  if (!resolved || hasSeen(seen, resolved)) {
    return false;
  }
  registerSeen(seen, resolved);
  loadDICOMFromUrl(resolved);
  return true;
}

function loadImageSource(url, seen) {
  const resolved = normalizeSourceUrl(url);
  if (!resolved || hasSeen(seen, resolved)) {
    return false;
  }
  registerSeen(seen, resolved);
  loadPicture(resolved);
  return true;
}

async function fetchAndLoadUpload(uploadId, seen) {
  const value = (uploadId || '').toString().trim();
  if (!value) {
    return false;
  }

  try {
    const response = await fetch(`/api/uploads/${encodeURIComponent(value)}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const meta = await response.json();
    let loaded = false;

    if (meta) {
      if (meta.isDicom) {
        const dicomSource =
          (meta.viewerParams && meta.viewerParams.dicomUrl) ||
          meta.absoluteDownloadUrl ||
          meta.downloadPath;
        if (dicomSource) {
          loaded = loadDicomSource(dicomSource, seen) || loaded;
        }

        const imageSource =
          (meta.viewerParams && meta.viewerParams.imageUrl) ||
          meta.absoluteDisplayUrl;
        if (imageSource) {
          loadImageSource(imageSource, seen);
        }
      } else {
        const imageSource =
          (meta.viewerParams && meta.viewerParams.imageUrl) ||
          meta.absoluteDisplayUrl ||
          meta.absoluteDownloadUrl;
        if (imageSource) {
          loaded = loadImageSource(imageSource, seen) || loaded;
        }
      }
    }

    if (!meta || !meta.isDicom) {
      hideDicomStatus();
    }

    return loaded;
  } catch (error) {
    console.error('Failed to load upload metadata:', error);
    showDicomStatus('Upload load error: ' + error.message, true);
    return false;
  }
}

async function processUploadIds(uploadIds, seen) {
  let loaded = false;
  for (let i = 0; i < uploadIds.length; i++) {
    const success = await fetchAndLoadUpload(uploadIds[i], seen);
    if (success) {
      loaded = true;
    }
  }
  return loaded;
}

async function loadManifest(manifestParam, seen) {
  const manifestUrl = normalizeSourceUrl(manifestParam);
  if (!manifestUrl) {
    return false;
  }

  try {
    const response = await fetch(manifestUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    let entries;
    if (Array.isArray(payload)) {
      entries = payload;
    } else if (payload && Array.isArray(payload.items)) {
      entries = payload.items;
    } else if (payload && Array.isArray(payload.uploads)) {
      entries = payload.uploads;
    } else if (payload) {
      entries = [payload];
    } else {
      entries = [];
    }

    let loaded = false;
    const uploadIds = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;

      if (typeof entry === 'string') {
        uploadIds.push(entry);
        continue;
      }

      if (entry.uploadId) {
        uploadIds.push(entry.uploadId);
      }

      if (entry.dicomUrl && loadDicomSource(entry.dicomUrl, seen)) {
        loaded = true;
      }

      if (entry.imageUrl && loadImageSource(entry.imageUrl, seen)) {
        loaded = true;
      }
    }

    if (uploadIds.length) {
      const idsLoaded = await processUploadIds(uploadIds, seen);
      loaded = idsLoaded || loaded;
    }

    return loaded;
  } catch (error) {
    console.error('Failed to load upload manifest:', error);
    showDicomStatus('Manifest load error: ' + error.message, true);
    return false;
  }
}

async function loadUploadsFromSystem(params, seen) {
  let loaded = false;
  if (!params) {
    return loaded;
  }

  const manifestParam = params.get('uploadManifest');
  if (manifestParam) {
    const manifestLoaded = await loadManifest(manifestParam, seen);
    loaded = manifestLoaded || loaded;
  }

  const uploadIdsParam = params.get('uploadId') || params.get('uploadIds');
  if (uploadIdsParam) {
    const parts = uploadIdsParam.split(',');
    const ids = [];
    for (let i = 0; i < parts.length; i++) {
      const raw = parts[i];
      if (!raw && raw !== 0) continue;
      const trimmed = String(raw).trim();
      if (trimmed) ids.push(trimmed);
    }
    if (ids.length) {
      const idsLoaded = await processUploadIds(ids, seen);
      loaded = idsLoaded || loaded;
    }
  }

  return loaded;
}

async function load_CustomUpload() {
  try {
    const params = new URLSearchParams(window.location.search);
    const seen = createSeenTracker();

    await loadUploadsFromSystem(params, seen);

    const imageUrl = params.get('imageurl');
    if (imageUrl && !params.get('webimgurl')) {
      if (!loadImageSource(imageUrl, seen)) {
        try {
          loadImageSource(decodeURIComponent(imageUrl), seen);
        } catch (error) {
          console.error('Failed to decode imageurl parameter:', error);
          loadPicture(imageUrl);
        }
      }
    }

    const dicomUrl = params.get('dicomurl');
    if (dicomUrl) {
      if (!loadDicomSource(dicomUrl, seen)) {
        try {
          const decoded = decodeURIComponent(dicomUrl);
          loadDicomSource(decoded, seen);
        } catch (error) {
          console.error('Failed to decode dicomurl parameter:', error);
          loadDICOMFromUrl(dicomUrl);
        }
      }
    }
  } catch (error) {
    console.error('load_CustomUpload error:', error);
  }
}

async function handleChickadeeIntegrationMessage(event) {
  try {
    if (!event || typeof event.data === 'undefined') {
      return;
    }
    if (event.origin && event.origin !== window.location.origin) {
      return;
    }

    const data = event.data || {};
    const messageType = (typeof data.type !== 'undefined' ? data.type : null) ||
      (typeof data.action !== 'undefined' ? data.action : null);

    if (messageType === 'chickadee:resetViewer') {
      resetViewport();
      return;
    }

    if (messageType === 'chickadee:loadUpload' || messageType === 'chickadee:loadUploads') {
      const payload = typeof data.payload !== 'undefined'
        ? data.payload
        : typeof data.uploads !== 'undefined'
          ? data.uploads
          : data.uploadId || data.upload;

      if (!payload) {
        return;
      }

      const entries = Array.isArray(payload) ? payload : [payload];
      const seen = createSeenTracker();
      const uploadIds = [];
      let loaded = false;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) {
          continue;
        }

        if (typeof entry === 'string') {
          uploadIds.push(entry);
          continue;
        }

        if (entry.uploadId) {
          uploadIds.push(entry.uploadId);
        }

        if (entry.dicomUrl && loadDicomSource(entry.dicomUrl, seen)) {
          loaded = true;
        }

        if (entry.imageUrl && loadImageSource(entry.imageUrl, seen)) {
          loaded = true;
        }
      }

      if (uploadIds.length) {
        const uniqueIds = [];
        const seenIds = Object.create(null);
        for (let i = 0; i < uploadIds.length; i++) {
          const id = (uploadIds[i] || '').toString().trim();
          if (id && !seenIds[id]) {
            seenIds[id] = true;
            uniqueIds.push(id);
          }
        }
        const idsLoaded = await processUploadIds(uniqueIds, seen);
        loaded = idsLoaded || loaded;
      }

      if (!loaded) {
        console.warn('No uploads were loaded from the provided payload.');
      }
    }
  } catch (error) {
    console.error('Failed to process integration message:', error);
  }
}

window.addEventListener('message', handleChickadeeIntegrationMessage);

function readAllJson(readJson) {
  //整合QIDO-RS的URL並發送至伺服器
  var queryString = ("" + location.search).replace("?", "");
  queryString = operateQueryString(queryString);
  if (queryString.length > 0) {
    var url = ConfigLog.QIDO.https + "://" + ConfigLog.QIDO.hostname + ":" + ConfigLog.QIDO.PORT + "/" + ConfigLog.QIDO.service + "/series" + "?" + queryString + "";
    url = fitUrl(url);
    readJson(url);
  }
  load_WebImg();
  load_CustomUpload();
}

function fitUrl(url) {
  url = url.replace('?&', '?');
  url = url.replace("http://http://", "http://");
  url = url.replace("https://http://", "https://");
  url = url.replace("http://https://", "http://");
  url = url.replace("https://https://", "https://");
  return url;
}

function readConfigJson(url, readAllJson, readJson) {
  //載入config檔的設定，包含伺服器、請求協定、類型...等等
  var config = {};
  var request = new XMLHttpRequest();
  request.open('GET', url);
  request.responseType = 'text';
  request.send();
  request.onload = function () {
    var DicomResponse = JSON.parse(request.responseText);
    config.QIDO = {};

    tempResponse = DicomResponse["DICOMWebServersConfig"][0];
    tempConfig = config.QIDO;
    tempConfig.hostname = tempResponse["QIDO-hostname"];
    tempConfig.https = tempResponse["QIDO-enableHTTPS"] == true ? "https" : "http";
    tempConfig.PORT = tempResponse["QIDO-PORT"];
    tempConfig.service = tempResponse["QIDO"];
    tempConfig.limit = tempResponse["limit"] ? tempResponse["limit"] : null;
    tempConfig.contentType = tempResponse["contentType"];
    tempConfig.timeout = tempResponse["timeout"];
    tempConfig.charset = tempResponse["charset"];
    tempConfig.includefield = tempResponse["includefield"];
    tempConfig.token = tempResponse["token"];
    tempConfig.enableRetrieveURI = tempResponse["enableRetrieveURI"];
    //tempConfig.enableXml2Dcm=tempResponse["enableXml2Dcm"];
    //tempConfig.Xml2DcmUrl=tempResponse["Xml2DcmUrl"];

    config.WADO = {};
    tempConfig = config.WADO;
    tempResponse = DicomResponse["DICOMWebServersConfig"][0];
    tempConfig.hostname = tempResponse["WADO-hostname"];
    tempConfig.https = tempResponse["WADO-enableHTTPS"] == true ? "https" : "http";
    tempConfig.PORT = tempResponse["WADO-PORT"];
    tempConfig.WADOType = tempResponse["WADO-RS/URI"];
    if (tempConfig.WADOType == "URI") tempConfig.service = tempResponse["WADO-URI"];
    else if (tempConfig.WADOType == "RS") tempConfig.service = tempResponse["WADO-RS"];
    else tempConfig.service = tempResponse["WADO-URI"];
    tempConfig.contentType = tempResponse["contentType"];
    tempConfig.timeout = tempResponse["timeout"];
    tempConfig.includefield = tempResponse["includefield"];
    tempConfig.token = tempResponse["token"];
    tempConfig.enableRetrieveURI = tempResponse["enableRetrieveURI"];

    //tempConfig.enableXml2Dcm=tempResponse["enableXml2Dcm"];
    //tempConfig.Xml2DcmUrl=tempResponse["Xml2DcmUrl"];

    config.STOW = {};
    tempConfig = config.STOW;
    tempResponse = DicomResponse["DICOMWebServersConfig"][0];
    tempConfig.hostname = tempResponse["hostname"];
    tempConfig.https = tempResponse["enableHTTPS"] == true ? "https" : "http";
    tempConfig.PORT = tempResponse["PORT"];
    tempConfig.service = tempResponse["STOW"];
    tempConfig.contentType = tempResponse["contentType"];
    tempConfig.timeout = tempResponse["timeout"];
    tempConfig.includefield = tempResponse["includefield"];
    tempConfig.token = tempResponse["token"];
    tempConfig.enableRetrieveURI = tempResponse["enableRetrieveURI"];
    //tempConfig.enableXml2Dcm=tempResponse["enableXml2Dcm"];
    //tempConfig.Xml2DcmUrl=tempResponse["Xml2DcmUrl"];

    config.Xml2Dcm = {};
    tempConfig = config.Xml2Dcm;
    tempConfig.enableXml2Dcm = tempResponse["enableXml2Dcm"];
    tempConfig.Xml2DcmUrl = tempResponse["Xml2DcmUrl"];
    tempConfig.token = tempResponse["token"];

    Object.assign(ConfigLog, config);
    configOnload = true;

    readAllJson(readJson);
  }
}

function getValue(obj) {
  if (obj && obj.Value && obj.Value[0]) {
    return obj.Value[0];
  }
}

function getWadoUriURL(studyUID, seriesUID, objectUID) {
  return `${ConfigLog.WADO.https}://${ConfigLog.WADO.hostname}:${ConfigLog.WADO.PORT}/${ConfigLog.WADO.service}?requestType=WADO&` +
    `studyUID=${studyUID}&seriesUID=${seriesUID}&objectUID=${objectUID}&contentType=application/dicom`;
}

function getWadoUriRS(studyUID, seriesUID, objectUID) {
  return `${ConfigLog.WADO.https}://${ConfigLog.WADO.hostname}:${ConfigLog.WADO.PORT}/${ConfigLog.WADO.service}` +
    `/studies/${studyUID}/series/${seriesUID}/instances/${objectUID}`;
}

function getJsonByInstanceRequest(SeriesResponse, InstanceRequest, instance) {
  let DicomResponse = InstanceRequest.response;
  var min = Number.MAX_VALUE, minI = 0;

  //取得最小的Instance Number
  for (var i = 0; i < DicomResponse.length; i++) {
    try { if (getValue(DicomResponse[i]["00200013"]) < min) min = getValue(DicomResponse[i]["00200013"]), minI = i; } catch (ex) { console.log(ex); };
  }

  //載入首張影像
  var firestImage = DicomResponse[minI];
  if (ConfigLog.WADO.WADOType == "URI")
    var url = getWadoUriURL(firestImage["0020000D"].Value[0], firestImage["0020000E"].Value[0], firestImage["00080018"].Value[0]);
  else if (ConfigLog.WADO.WADOType == "RS")
    var url = getWadoUriRS(firestImage["0020000D"].Value[0], firestImage["0020000E"].Value[0], firestImage["00080018"].Value[0]);

  url = fitUrl(url);
  LoadFileInBatches.wadoPreLoad(url);

  //載入其餘所有影像
  function loadDicom(dicomImg) {
    if (ConfigLog.WADO.WADOType == "URI")
      var url = getWadoUriURL(dicomImg["0020000D"].Value[0], dicomImg["0020000E"].Value[0], dicomImg["00080018"].Value[0]);
    else if (ConfigLog.WADO.WADOType == "RS")
      var url = getWadoUriRS(dicomImg["0020000D"].Value[0], dicomImg["0020000E"].Value[0], dicomImg["00080018"].Value[0]);
    url = fitUrl(url);
    LoadFileInBatches.wadoPreLoad(url, true);
  }

  for (var i = 0; i < DicomResponse.length; i++) {
    const i_ = i;
    if (i_ != minI) loadDicom(DicomResponse[i_]);
  }
}

function getJsonBySeriesRequest(SeriesRequest) {
  // Check if response exists and has data
  if (!SeriesRequest || !SeriesRequest.response) {
    console.error("Error: Series request response is empty or invalid");
    showDicomStatus("Error: Invalid server response", true);
    return;
  }

  let SeriesResponse = SeriesRequest.response;

  // Check if SeriesResponse is an array and has items
  if (!Array.isArray(SeriesResponse) || SeriesResponse.length === 0) {
    console.error("Error: Series response is not a valid array or is empty");
    showDicomStatus("Error: No series data available", true);
    return;
  }

  for (let instance = 0; instance < SeriesResponse.length; instance++) {
    function requestInstances(offset) {
      const offset_ = offset;
      let InstanceUrl = "";

      try {
        if (ConfigLog.QIDO.enableRetrieveURI === true &&
          SeriesResponse[instance] &&
          SeriesResponse[instance]["00081190"] &&
          SeriesResponse[instance]["00081190"].Value &&
          SeriesResponse[instance]["00081190"].Value[0]) {
          InstanceUrl = SeriesResponse[instance]["00081190"].Value[0] + "/instances";
        } else if (SeriesResponse[instance] &&
          SeriesResponse[instance]["0020000D"] &&
          SeriesResponse[instance]["0020000D"].Value &&
          SeriesResponse[instance]["0020000E"] &&
          SeriesResponse[instance]["0020000E"].Value) {
          InstanceUrl = fitUrl(ConfigLog.QIDO.https + "://" + ConfigLog.QIDO.hostname + ":" + ConfigLog.QIDO.PORT + "/" + ConfigLog.QIDO.service) +
            "/studies/" + SeriesResponse[instance]["0020000D"].Value[0] +
            "/series/" + SeriesResponse[instance]["0020000E"].Value[0] + "/instances";
        } else {
          console.error("Error: Missing required DICOM data in series response");
          showDicomStatus("Error: Missing DICOM data in response", true);
          return;
        }
      } catch (error) {
        console.error("Error building instance URL:", error);
        showDicomStatus("Error processing DICOM data: " + error.message, true);
        return;
      }

      if (ConfigLog.WADO.includefield === true) {
        InstanceUrl += "?includefield=all";
      }

      if (ConfigLog.WADO.https === "https") {
        InstanceUrl = InstanceUrl.replace("http:", "https:");
      }

      if (ConfigLog.QIDO.limit) {
        if (ConfigLog.WADO.includefield === true) {
          InstanceUrl += `&limit=${ConfigLog.QIDO.limit}&offset=${offset_}`;
        } else {
          InstanceUrl += `?limit=${ConfigLog.QIDO.limit}&offset=${offset_}`;
        }
      }

      let InstanceRequest = new XMLHttpRequest();
      InstanceRequest.open('GET', InstanceUrl);
      InstanceRequest.responseType = 'json';

      // Error handling for instance request
      InstanceRequest.onerror = function () {
        console.error("Network error occurred while fetching instance data");
        showDicomStatus("Network error: Could not retrieve instance data", true);
      };

      // Handle timeouts
      InstanceRequest.timeout = 30000; // 30 seconds timeout
      InstanceRequest.ontimeout = function () {
        console.error("Instance request timed out");
        showDicomStatus("Request timed out: Instance retrieval failed", true);
      };

      //發送以Instance為單位的請求
      var wadoToken = ConfigLog.WADO.token;
      for (var to = 0; to < Object.keys(wadoToken).length; to++) {
        if (wadoToken[Object.keys(wadoToken)[to]] != "") {
          InstanceRequest.setRequestHeader("" + Object.keys(wadoToken)[to], "" + wadoToken[Object.keys(wadoToken)[to]]);
        }
      }

      const instance_ = instance;
      InstanceRequest.send();

      InstanceRequest.onload = function () {
        if (InstanceRequest.status !== 200) {
          console.error("HTTP error for instance request:", InstanceRequest.status);
          showDicomStatus("PACS error: Failed to retrieve instance (Status " + InstanceRequest.status + ")", true);
          return;
        }

        try {
          // Check if response is valid
          if (!InstanceRequest.response) {
            console.error("Empty instance response");
            showDicomStatus("Error: Empty instance data received", true);
            return;
          }

          getJsonByInstanceRequest(SeriesResponse, InstanceRequest, instance_);

          // Check if we need to request more instances due to pagination
          if (ConfigLog.QIDO.limit &&
            Array.isArray(InstanceRequest.response) &&
            InstanceRequest.response.length == ConfigLog.QIDO.limit) {
            requestInstances(offset_ + ConfigLog.QIDO.limit);
          }
        } catch (error) {
          console.error("Error processing instance data:", error);
          showDicomStatus("Error processing instance data: " + error.message, true);
        }
      }
    }

    try {
      requestInstances(0);
    } catch (error) {
      console.error("Error starting instance request:", error);
      showDicomStatus("Error loading DICOM data: " + error.message, true);
    }
  }
}

function readJson(url) {
  //向伺服器請求資料
  if (ConfigLog.WADO.https == "https") url = url.replace("http:", "https:");
  let SeriesRequest = new XMLHttpRequest();
  SeriesRequest.open('GET', url);
  SeriesRequest.responseType = 'json';
  var wadoToken = ConfigLog.WADO.token;
  for (var to = 0; to < Object.keys(wadoToken).length; to++) {
    if (wadoToken[Object.keys(wadoToken)[to]] != "") {
      SeriesRequest.setRequestHeader("" + Object.keys(wadoToken)[to], "" + wadoToken[Object.keys(wadoToken)[to]]);
    }
  }

  // Add error handling
  SeriesRequest.onerror = function () {
    console.error("Network error occurred while fetching series data");
    showDicomStatus("PACS server error", true);
  };

  // Handle timeouts
  SeriesRequest.timeout = 30000; // 30 seconds timeout
  SeriesRequest.ontimeout = function () {
    console.error("Request timed out");
    showDicomStatus("PACS server error", true);
  };

  //發送以Series為單位的請求
  SeriesRequest.send();
  SeriesRequest.onload = function () {
    if (SeriesRequest.status !== 200) {
      console.error("HTTP error:", SeriesRequest.status);
      showDicomStatus("PACS server error");
      return;
    }
    try {
      getJsonBySeriesRequest(SeriesRequest);
    } catch (error) {
      console.error("Error processing series data:", error);
      showDicomStatus("Error processing series data: " + error.message, true);
    }
  }
}
