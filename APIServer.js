/****************************************

2012-10-12 - Ben Bradley - benjamin.bradley@integratelecom.com

ABOUT - APIServer.js is a NodeJS script that extends
 the Spectrum VNMSH application making it possible to
 execute vnmsh commands through an HTTP GET request.

HOW IT WORKS - Executing this script will fire up a
 HTTP server on port 8008.  When it receives a request
 (from a user's browser, curl, wget, etc.) it processes
 the path of the request and translates it into a vnmsh
 command.  For example, if you wanted to show all the
 models on a landscape, you could go to this URL:
 
  http://landscape1.dns:8008/vnmsh/show/models
 
 If you wanted to show all the alarms & ticket numbers,
 you could go to this URL:
 
  http://landscape1.dns:8008/vnmsh/show/alarms/-a/-t
 
 And if you wanted the response in JSON format, you
 could hit this URL:
 
  http://landscape1.dns:8008/vnmsh/show/alarms/-a/-t?format=json
 
 A good way to think if it is any VNMSH command can be
 executed by substituting forward-slashes for the spaces
 that you'd type if you were executing the command from
 the CLI.  Any VNMSH command that you want to execute can
 be done via an HTTP GET request of the following format:
 
  http://landscape1.dns:8008/vnmsh/<show|create|destroy|etc.>/<option 1>/<option 2>/...

HOWTO - To get this working, you'll need to install
 NodeJS on one (or all) of your SpectroSERVERs.  Most
 vnmsh commands include an option to specify a landscape
 handle so you can either install this on each landscape
 or you can install it on one, and specify an 'lh' value
 in the URL path.
 
 Once you get NodeJS installed, you'll need ot start this
 script.  If the script crashes (and it may) error message
 data is printed to the console so it's a good idea to use
 some sort of application manager that can catch if the
 script crashes so that it can be logged & restarted.

NOTES - There is exactly NO authentication built into this
 script so if you install it, ANYONE that can send GET
 requests to the landscape can execute VNMSH commands if
 they know the proper variables.  There's no activity log
 to trace back who did what.  That may come later, but
 this version is very, very simple.
 
 If you want to have this double as a simple web server,
 you can build a folder named 'ui' in the same directory
 as the script and host files out of there.  However,
 'index.html' should be in the same directory as this script.

****************************************/

var	www			= require('http'),
	url			= require('url'),
	fs			= require('fs'),
	path		= require('path'),
	child		= require('child_process'),
	sVnmshPath	= '/opt/CA/Spectrum/vnmsh/';

/*
 web server code
*/
www.createServer(function(req,res){
 req.addListener('end',function(){});
 var	oUrl = url.parse(req.url,true),
 		aRoute = oUrl.pathname.replace(/^\/|\/$/g,'').split('/');
 // request for index.html
 if (aRoute[0] == '') {
  res.writeHead(200,{'Content-Type':'text/html'});
  res.end(fs.readFileSync('index.html','utf8'),'utf8');
 }
 // request for ui files
 else if (aRoute[0] == 'ui' && aRoute.length != 1 && aRoute[1] != '') {
  var	sFile = '.'+req.url,
  		sExt = path.extname(sFile);
  fs.exists(sFile,function(exists) {
   if (exists) {
    var	sContentType = (sExt == '.js') ? 'text/javascript' : 'text/html',
    	sContentType = (sExt == '.pdf') ? 'application/pdf' : sContentType,
    	sEncoding = (sExt == '.pdf') ? 'binary' : 'utf8';
    sContentType = (sExt == '.css') ? 'text/css' : sContentType;
    res.writeHead(200,{'Content-Type':sContentType});
    res.end(fs.readFileSync(sFile,'utf8'), sEncoding);
   } else { sendOutput(res,'bad request\n'); }
  });
 }
 // handle the vnmsh routes
 else if (aRoute[0] == 'vnmsh') {
  fs.exists(sVnmshPath+aRoute[1],function(exists) {
   if (exists) {
    var	sAction = aRoute[1],
    	aArgs = aRoute.slice(2),
    	sFormat = oUrl.query.format,
    	bSafeCommand = true;
    for (var a in aArgs) {
     if (aArgs[a].match(/^(\||&&|;|>+|<+)$/)) { // catch command insertion & redirection
      sendOutput(res,'unsafe command detected');
      bSafeCommand = false;
     }
     aArgs[a] = decodeURIComponent(aArgs[a]); // decode URI
    }
    if (bSafeCommand) { vnmshAction(res,sAction,aArgs,sFormat); }
   }
   else {
    var sVnmshHelp = ''+
     'options are:\n'+
     '\tack\n'+
     '\tcreate\n'+
     '\tdestroy\n'+
     '\tshow\n'+
     '\tupdate';
    sendOutput(res,sVnmshHelp);
   }
  });
 }
 else { sendOutput(res,'bad request'); }
}).listen('8008');

/*
 send a response
*/
function sendOutput(res,sOutput) {
 res.write(sOutput);
 res.end();
}

/*
 format the response to be JSON
*/
function sendJson(res,sStdout) {
 res.writeHead(200,{'Content-Type':'text/javascript'});
 var	aRows = sStdout.split('\n'), // split the stdout on the newline
   		sHead = aRows[0], // the header row
   		aCols = sHead.replace(/ +/g,' ').split(' '),
   		iCols = aCols.length,
   		oCols = {},
   		oRows = { rows:[] };
 for (var c=0;c<aCols.length;c++) {
  var	iStart = (c==0) ? 0 : sHead.indexOf(aCols[c]),
   		iEnd = (aCols[c+1]) ? sHead.substr(iStart).indexOf(aCols[c+1]) : 256;
  oCols[aCols[c]] = { start:iStart, end:iEnd };
 }
 aRows = aRows.slice(1); // remove the header column
 for (var r in aRows) {
  var	sRow = aRows[r],
   		oRow = {};
  for (var c in oCols) { oRow[c] = sRow.substr(oCols[c].start,oCols[c].end).replace(/ *$/,''); }
  oRows.rows.push(oRow);
 }
 sendOutput(res,JSON.stringify(oRows.rows));
}

/*
 this fn connects to the vnmsh for subsequent operations
*/
function vnmshConnect(res, fn) {
 var	chVnmshConnect = child.spawn(sVnmshPath+'connect'),
 		sStdout = '',
 		sStderr = '';
 chVnmshConnect.stdout.on('data', function(data) { sStdout += data; });
 chVnmshConnect.stderr.on('data', function(data) { sStderr += data; });
 chVnmshConnect.on('exit', function(code) {
  if (code != 0) { sendOutput(res,'vnmsh connect failed:\n'+sStderr); }
  else { fn(); } // connected
 });
}

/*
 fn to run an action in the vnmsh
*/
function vnmshAction(res, sAction, aArgs, sFormat) {
 console.log(sAction+' '+aArgs.join(' '));
 vnmshConnect(res, function() {
  var	chVnmshAction = child.spawn(sVnmshPath+sAction,aArgs),
		sStdout = '',
		sStderr = '';
  chVnmshAction.stdout.on('data', function(data) { sStdout += data; });
  chVnmshAction.stderr.on('data', function(data) { sStderr += data; });
  chVnmshAction.on('exit', function(code) {
   if (code != 0) { sendOutput(res,sStderr); }
   else if (sStdout != '') {
    if (sAction == 'show' && sFormat == 'json') { sendJson(res,sStdout); }
    else { sendOutput(res,sStdout); }
   }
   else if (sStderr != '') { sendOutput(res,sStderr); } // show stderr
  });
 });
}

