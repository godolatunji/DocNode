/**
 * Created by tjazz on 10/10/2016.
 */
'use strict';

var p = require('path');
var fs = require('fs');
var readline = require('readline');

function DocGo() {
    this.title = 'API Documentation';
    this.baseUrl = 'http://localhost';
    this.author = "Awesome Developer"
    this.extraInformation = "";
}

/**
 *
 * @param readString this is the string contents of the index file or route file
 * @param options the options object that contains the title, baseUrl etc.
 * @param callback the result which have the format (error, html)
 */
DocGo.prototype.render = function(filePath, options, callback){
    if(!options.constructor === Object){
        //throw new Error("Options has to be an object");
        return callback("Options has to be an object", null);
    }
    this.title = options.title ? options.title : this.title;
    this.baseUrl = options.baseUrl ? options.baseUrl : this.baseUrl;
    this.extraInformation = options.extra ? options.extra : this.extraInformation;
    this.author = options.author ? options.author : this.author;

    // parse the main route file
    var indexContents = fs.readFileSync(filePath, 'utf-8');
    var routesArray = parseIndexFile(indexContents);

    // get the main route directory, this will be using when navigating the sub directories
    var indexDirectory = p.dirname(filePath);

    // parse each element of the routes Array and return their names and route files
    var routes = getRoutesNameAndFile(routesArray);

    // generating the json structure for each routes
    var result = [];
    routes.forEach(function(doc){

        var routeContent = fs.readFileSync(p.join(indexDirectory, doc.route), 'utf-8');
        result.push(parseRouteFile(doc.group, routeContent));

    });
    // merging the menus and bodies generated from each route
    var document = {}; document.menu = [], document.body = [];
    for(var i = 0; i < result.length; i++){
        var temp = result[i];
        document['menu'].push(temp.url);
        document['body'].push(temp.body);
    }
     // return callback(null, document);
    var html = this.generateHtml(document);
    // html = minifyHtml(html);
    return callback(null, html);
};

/**
 *
 * @param content
 * @returns {*}
 */
DocGo.prototype.generateHtml = function(content) {
    var swig = require('swig');
    var template = swig.compileFile(p.join(__dirname, './template/template.html'));
    return template({
        pageTitle: this.title,
        pageAuthor: this.author,
        dateNow: new Date().toUTCString(),
        baseUrl: this.baseUrl,
        content: content,
        extraInfo: this.extraInformation,
    });
};

/**
 * This function parses the main route file and returns an array of endpoints
 * @param value
 * @returns {Array}
 */
function parseIndexFile(value) {
    var array = value.toString().split("\n");
    var start = -false;
    var result = [];
    for(var i = 0; i < array.length; i++){
        if(array[i].indexOf("begin: routes") > -1){
            start = true;
        }
        else if(start){
            result.push(array[i])
        }

        if(array[i].indexOf("end: routes") > -1){
            break;
        }
    }
    result.pop();
    return result;
}

/**
 * This function parses an endpoint and return its uri and route file
 * @param array
 * @returns {Array}
 */
function getRoutesNameAndFile(array){
    var doc = [];
    for(var i =0; i < array.length; i++){
        var temp = {}; var value = array[i];
        if(value.startsWith('//')) continue;
        var section = value.slice(value.indexOf('(', value.indexOf('(')), value.indexOf(')') + 1);
        var arr = section.split(",");
        temp.group = arr[0].slice(arr[0].indexOf('/') + 1);
        temp.route = arr[1].slice(arr[1].indexOf("'") + 1);

        temp['group'] = temp['group'].split('');
        temp['group'].pop();
        temp['group'] = temp['group'].join('');

        temp['route'] = temp['route'].split('');
        temp['route'].pop(); temp['route'].pop();
        temp['route'] = temp['route'].join('') + '.js';             // adding extension

        doc.push(temp);
    }
    return doc;
}

/**
 * This function parses a router file and return an array of comments and router endpoints
 * @param group
 * @param value
 */
function parseRouteFile(group, value){
    var array = value.toString().split("\n");
    var start = false;
    var blob = "";
    for(var i = 0; i < array.length; i++){

        if(array[i].startsWith('/**')){
            start = true;
        }
        else if(start){
            if(array[i].indexOf('*/') > -1){
                start = false;
                blob += array[i+1] + "\n";
            }
            blob += array[i] + "\n";
        }
        else {

        }
    }
    //return  blob;
    return generateStructs(group, blob);
}

/**
 * this functions takes a group of cooments and router endpoint and returns an array of object;
 * @param group
 * @param blob
 * @returns {Object}
 */
function generateStructs(group, blob){
    var largerArray = blob.split('*/');
    var result = []; var urlStruct = {}, bodyStruct = {};
    for(var i = 0; i < largerArray.length; i++){
        var temp = parseEachMethod(group, largerArray[i].trim());
        if(!temp.url) continue;                                     // remove all empty comments
        result.push(temp);
    }
    //return result;
    bodyStruct = {
        id: group,
        group: group,
        routes: generateBodyStruct(result)
    };
    urlStruct = {
        id: group,
        group: group,
        routes: generateUrlStruct(result)
    };
    return {
        url: urlStruct,
        body: bodyStruct
    };
}

/**
 * This function takes a a comment and returns an object
 * @param group
 * @param route
 * @returns {*}
 */
function parseEachMethod(group, route){
    if(route.indexOf('Created by') > -1 && route.indexOf('use strict') > -1){
        return [];
    }

    var array = route.split("\n");
    var parameters = [], requestBody = [], filters = [], temp = {}; temp.description = '';
    for(var i=0;i<array.length;i++){
        var result = assignStructure(array[i]);
        if(result['flag'] === 'title'){
            temp.title = result.title;
        }
        else if(result['flag'] === 'body'){
            delete result.flag;
            requestBody.push(result);
        }
        else if(result['flag'] === 'param'){
            delete result.flag;
            parameters.push(result);
        }
        else if(result['flag'] === 'query'){
            delete result.flag;
            filters.push(result);
        }
        else if(result['flag'] === 'uri'){
            temp.url = '/' + group + result.uri;
            if(temp['url'].endsWith('/')){
                temp.url = temp['url'].slice(0, temp['url'].length - 1);
            }
            temp.method = result.method;
        }
        else if(result['flag'] === 'description'){
            temp.description += result.desc;
        }
    }
    temp.parameters = parameters;
    temp.requestBody = requestBody;
    temp.filters = filters;
    return temp;
}

/**
 * This functions takes a line of the comment and return a formatted structure of where it belongs
 * @param value
 * @returns {{}}
 */
function assignStructure(value){
    value = value.trim();
    var result = {}; var temp = '';
    if(value.indexOf('@title') > -1){
        result.flag = "title";
        result.title = value.slice(value.indexOf('@title') + 6).trim();
    }
    else if(value.indexOf('@body') > -1){
        result.flag = "body";
        temp = value.slice(value.indexOf('@body') + 5).trim();
        temp = temp.split(' ');
        result.type = temp[0];
        result.name = temp[1];
        result.description = value.slice(value.indexOf(result['name']) + result['name'].length)
    }
    else if(value.indexOf('@file') > -1){
        result.flag = "body";
        temp = value.slice(value.indexOf('@file') + 5).trim();
        temp = temp.split(' ');
        result.type = temp[0];
        result.name = temp[1];
        result.description = value.slice(value.indexOf(result['name']) + result['name'].length)
    }
    else if(value.indexOf('@param') > -1){
        result.flag = "param";
        temp = value.slice(value.indexOf('@param') + 6).trim();
        temp = temp.split(' ');
        result.type = temp[0];
        result.name = temp[1];
        result.description = value.slice(value.indexOf(result['name']) + result['name'].length)
    }
    else if(value.indexOf('@query') > -1){
        result.flag = "query";
        temp = value.slice(value.indexOf('@query') + 6).trim();
        temp = temp.split(' ');
        result.type = temp[0];
        result.name = temp[1];
        result.description = value.slice(value.indexOf(result['name']) + result['name'].length)
    }
    else if(value.indexOf('(req, res)') > -1){
        result.flag = 'uri';
        result.method = value.slice(value.indexOf('.') + 1, value.indexOf('('));
        result.uri = value.slice(value.indexOf("'") + 1, value.indexOf(',') - 1);
    }
    else {
        result.flag = "description";
        result.desc = value;
    }
    return result;
}


function generateUrlStruct(array) {
    var result = [];
    for(var i=0;i<array.length;i++) {
        var pattern = "/",
            re = new RegExp(pattern, "g");
        var temp = array[i]['url'].replace(re, '-') + '-' + array[i].method;
        temp = temp.toLowerCase();
        temp = temp.slice(1);
        result.push({
            id: temp,
            title: array[i].title
        });
    }
    return result;
}

function generateBodyStruct(array) {
    var result = [];
    for(var i=0;i<array.length;i++) {
        var temp = array[i];
        //generating ids
        var pattern = "/",
            re = new RegExp(pattern, "g");
        temp.id = temp['url'].replace(re, '-') + '-' + temp.method;
        temp.id = temp['id'].toLowerCase();
        temp.id = temp['id'].slice(1);

        result.push(temp);
    }
    return result;
}
//:TODO add a minifier script
// function minifyHtml(html) {
//     var pattern = "\n",
//         re = new RegExp(pattern, "g");
//     html = html.replace(re, '');
//     pattern = "\t";
//     re = new RegExp(pattern, "g");
//     html = html.replace(re, '');
//     return html;

// }

module.exports = new DocGo();