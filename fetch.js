#!/usr/bin/env node
/**
 * fetch.js - Fetches proxies from the following sites that have public proxy lists:
 *
 *  - http://proxylist.hidemyass.com/search-1292985/1 (300-900 proxies)
 *  - http://incloak.com/proxy-list/#list (250-400 proxies)
 *  - http://proxy-list.org/english/index.php?p=1 (140 proxies)
 *  - https://nordvpn.com/wp-admin/admin-ajax.php... (500-1000 proxies, low success rate)
 *    http://www.cool-proxy.net/proxies/... (200 proxies)
 *
 *  Hidemyass is pretty tricky as they obfuscate the ip's using a few dirty techniques.. pretty clever but
 *  we can bypass that with a little work.
 *
 * I'd recommend running this every couple of hours if you want to maximize your mining, easy to do:
 * ./fetch.js --retry=120       (will retry every 2 hrs)
 *
 * By default it will append any proxies found to a file in ./proxies/fetched/fetched_proxies_DD_MM_YYYY.txt
 * You can override this with the -o flag, e.g. ./fetch.js -o proxies.txt
 *
 * This script can be used in conjunction with proxy-verify ( https://github.com/jthatch/proxy-verify )
 * To ensure the proxies are working.
 *
 *
 * (c) jthatch http://github.com/jthatch
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/*jshint esversion: 6 */
'use strict';

const fs = require('fs');
const util = require('util');
const path = require('path');
const cluster = require('cluster');
const EventEmitter = require('events').EventEmitter;

const cheerio = require('cheerio');
const request = require('request');
const chalk = require('chalk');

/**
 * This follows the observer design pattern. We take arguments first from options, then argv then resort to defaults
 * @constructor
 */
function Fetch(options) {
    options = options || {};
    /**
     * Note you can use the {page} variable in the url and it'll be replaced w/ the page number as we paginate.
     * By default it'll start on page 1 and keep up until it finds no more proxies, however..
     * you can specify the start page by using {page:2} to start from page 2.
     * You can ALSO use {page:0-64} to start on page 0, but increment each page by 64.. this is to handle incloak.com
     * @type {*|Array|string[]}
     */
    this.urls = options.urls || [
        'http://proxylist.hidemyass.com/search-1292985/{page}',
        'http://incloak.com/proxy-list/?start={page:0-64}',
        'https://nordvpn.com/wp-admin/admin-ajax.php?searchParameters%5B0%5D%5Bname%5D=proxy-country&searchParameters%5B0%5D%5Bvalue%5D=&searchParameters%5B1%5D%5Bname%5D=proxy-ports&searchParameters%5B1%5D%5Bvalue%5D=&offset={page:0-1000}&limit=1000&action=getProxies',
        'http://proxy-list.org/english/index.php?p={page}',
        'http://www.cool-proxy.net/proxies/http_proxy_list/page:{page}/sort:score/direction:desc'
    ];
    // ensure this directory exists
    this.outputFile = options.outputFile || "proxies/fetched/fetched_proxies_{date}.txt";
    // show extra debug info
    this.verbose = options.verbose || false;
    this.retry = options.retry || false;

    // internal variables
    this._urlIndex = 0;
    this._urlPage = -1;
    this._proxies = [];
    this._startTime = new Date().getTime();
    this._requestTimeout = 5e3;

    EventEmitter.call(this);
}

Fetch.prototype.main = function() {
    var _this = this;

    if (this.verbose) {
        _this.log("Fetching proxies from:");
        this.urls.forEach(function (url, inc) {
            _this.log(++inc + ".\t", "c:bold", url);
        });
    }

    this.on('fetchPage', function(data) {
        if (!data.error && data.response.statusCode === 200) {

            var proxies = _this.extractProxies(data);

            if (proxies.length) {
                _this.log("c:green", "Found ", "c:green bold", proxies.length, "c:green", " proxies on ",
                    "c:green bold", (data.url), "c:green", " in ",
                    "c:green bold",  _this.runTime(data.duration));
                _this._proxies.push.apply(_this._proxies, proxies);
                _this.fetchPage();
            }
            // try the next url
            else if (_this.urls[_this._urlIndex + 1]) {
                _this._urlIndex++;
                _this._urlPage = -1;
                _this.fetchPage();
            }
            else {
                _this.log();
                _this.saveProxies();

                if (_this.retry) {
                    var mins = parseInt(_this.retry) * 60000;
                    this.log("");
                    this.log("c:yellow", "Retrying in ", "c:yellow bold", _this.runTime(new Date().getTime() - mins));
                    setTimeout(function () {
                        _this.startPage = 1;
                        _this._proxies = [];
                        _this.fetchPage();
                    }, mins);
                }

            }
        }
        else {
            if (_this.verbose)
              _this.log("c:red", "Error connecting to ", "c:red bold", data.url, " ",  "c:red bold", data.error);
            _this.log();
            _this.saveProxies();
        }

    });

    this.fetchPage();
};



/**
 * Request the html from the site, also incrementing the page
 */
Fetch.prototype.fetchPage = function() {
    var _this = this;

    var startTime = new Date().getTime();
    var url = this.urls[this._urlIndex];
    // defaults
    var startPage = 1;
    var inc = 1;

    // now replace {page} or {page
    var parts = new RegExp(/{page(.*)}/).exec(url);
    if (parts) {
        var params = parts[1];

        if (params.indexOf(':') > -1) {
            params = params.split(':')[1];

            if (params.indexOf('-') > -1) {
                [startPage, inc] = params.split('-');
            }
            else {
                startPage = parseInt(params);
            }
        }

        // if it's the first time running this url then urlPage will be -1
        if (this._urlPage < 0) {
            this._urlPage = startPage;
        }
        else {
            startPage = parseInt(this._urlPage);
        }
        url = url.replace(/{page.*}/, String(startPage));
    }

    startPage = parseInt(startPage) + parseInt(inc);
    this._urlPage = startPage;

    if (this.verbose) this.log("Loading ", "c:bold", url);
    request({
        method: 'GET',
        timeout : _this.requestTimeout,
        headers: {
            "User-Agent":_this.userAgent()
        },
        url: url
    }, function (error, response, body) {
        _this.emit('fetchPage', {error: error, url: url, response: response, body: body, duration: startTime});
    });
};


Fetch.prototype.saveProxies = function() {
    var _this = this;

    this.outputFile = String(this.outputFile).replace("{date}", this.dateStamp());

    if (fs.existsSync(this.outputFile)) {
        var origProxies = fs.readFileSync(this.outputFile).toString('utf8').split('\n');
        var oldTotal = this._proxies.length;
        this.log("Total ", "c:bold", this._proxies.length, " proxies. Appending to ",
            "c:bold", origProxies.length, " found in ", "c:bold", this.outputFile);

        this._proxies.push.apply(this._proxies, origProxies);

        oldTotal = this._proxies.length;
        this._proxies = this._proxies.filter(function (el, index, self) {
            return index == self.indexOf(el);
        });

        if (oldTotal - this._proxies.length > 0) {
            _this.log("Removing ", "c:bold", (oldTotal - this._proxies.length),
                " duplicates. Grand Total ", "c:bold", this._proxies.length);
        }
    }

    fs.writeFileSync(this.outputFile, this._proxies.join("\n"), "utf8");
    this.log("c:cyan", "Saved ", "c:cyan bold", this._proxies.length, "c:cyan", " unique proxies to ",
        "c:cyan bold", this.outputFile);
    // emit a complete call so this can be hooked into others
    this.emit('complete', this.outputFile, this._proxies.length);
};

/**
 * extractProxies will process the html using cheerio and attempt to extract the IP:PORTS from the html.
 * They use a few sneaky tricks to obfuscate the ips so we need some regex and loops to get at real data.
 * @param data
 * @returns {Array}
 */
Fetch.prototype.extractProxies = function(data) {
    var _this = this;

    var html = data.body;
    var $ = cheerio.load(html);
    var ips = [];


    if (data.url.indexOf('hidemyass') > -1) {

        $('#listable>tbody>tr').each(function (index) {
            var a = $(this);

            // grab the style information for each row
            var style = a.find('td:nth-child(2)>span>style').text();
            var port = a.find('td:nth-child(3)').text().trim();

            // determine which style classes are visible and which are hidden
            var styles = style.match(/\.([a-zA-Z0-9-_]+)\{display\:([\w]+)/ig);

            if (!styles.length) {
                _this.log('c:bgRed', 'Warning, they may have changed their non-js html');
            }

            var classes = {};

            for (var key in styles) {
                var re = /\.([a-zA-Z0-9-_]+)\{display\:([\w]+)/ig;
                var visible = re.exec(styles[key]);

                if (visible) {
                    var className = visible[1];
                    var displayType = visible[2];
                    classes[className] = (displayType.toLowerCase() == 'inline');
                }
            }

            var contents = a.find("td:nth-child(2)>span").html();
            contents = contents.replace(/\s\s+/gm, '');
            contents = contents.replace(/\r?\n|\r/gm, '');
            contents = contents.replace(/(<style>.+<\/style>)/ig, "");

            var contentsHtml = contents.split('>');
            var ip = '';
            for (key = 0; key < contentsHtml.length; key += 2) {
                var current = contentsHtml[key];
                var nextHtml = contentsHtml[key + 1];
                var next = nextHtml ? nextHtml.split('<')[0] : undefined;
                var reC = /class=\"(.+)\"/ig;
                var clsHtml = reC.exec(current);
                var cls = clsHtml ? clsHtml[1] : undefined;

                if (current[0] != '<') {
                    var parts = current.split('<');
                    ip += String(parts[0]);
                }
                //  inline
                if (current.indexOf('inline') > -1) {
                    ip += next;
                }
                // class
                if (cls) {
                    if (classes[cls] || cls.match(/^[0-9]+$/)) {
                        ip += next;
                    }
                }

            }
            if (!_this.validateIpAddress(ip)) {
                _this.log('c:bgRed bold', 'invalid ip address: ' + ip);
                console.log(styles);
                console.log(contents);
            }

            ips.push(ip + ':' + port);
        });
    }

    else if (data.url.indexOf('incloak') > -1) {
        $('table.proxy__t>tbody>tr').each(function (index) {
            var a = $(this);

            // grab the style information for each row
            var ip = a.find('td:nth-child(1)').text().trim();
            var port = a.find('td:nth-child(2)').text().trim();
            if (!_this.validateIpAddress(ip)) {
                _this.log('c:bgRed bold', 'invalid ip address: ' + ip);
            }
            ips.push(ip + ':' + port);
        });
    }
    // proxy-list base64 encodes their ip's but this can be easily decoded in NodeJs
    else if (data.url.indexOf('proxy-list') > -1) {
        $('#proxy-table .table>ul').each(function (index) {
            var a = $(this);

            // grab the style information for each row
            var ip = a.find('.proxy').text().trim();
            var parts = new RegExp(/Proxy\(\'(.+)\'\)/).exec(ip);
            if (parts[1]) {
                ip = Buffer.from(parts[1], 'base64').toString();
            }
            var port;
            [ip, port] = ip.split(':');
            if (!_this.validateIpAddress(ip)) {
                _this.log('c:bgRed bold', 'invalid ip address: ' + ip);
            }
            ips.push(ip + ':' + port);
        });
    }
    else if (data.url.indexOf('nordvpn') > -1) {
        var proxies = JSON.parse(html);

        proxies.forEach(function(proxy) {
            if (proxy.type == 'HTTP') {
                if (!_this.validateIpAddress(proxy.ip)) {
                    _this.log('c:bgRed bold', 'invalid ip address: ' + proxy.ip);
                }
                ips.push(proxy.ip + ':' + proxy.port);
            }
        });
    }
    // cool-proxy base64 encodes and rot13's their ips
    else if (data.url.indexOf('cool-proxy') > -1) {
        $('#main table tr').each(function (index) {
            var a = $(this);
            var str_rot13 = function(str) {
                return (str + '')
                .replace(/[a-z]/gi, function(s) {
                    return String.fromCharCode(s.charCodeAt(0) + (s.toLowerCase() < 'n' ? 13 : -13));
                });
            };


            var ip = a.find('td:nth-child(1)').text().trim();
            var port = a.find('td:nth-child(2)').text().trim();
            var parts = new RegExp(/str_rot13\(\"(.+)\"\)/).exec(ip);
            if (parts) {
                ip = Buffer.from(str_rot13(parts[1]), 'base64').toString();

                if (!_this.validateIpAddress(ip)) {
                    _this.log('c:bgRed bold', 'invalid ip address: ' + ip);
                }
                ips.push(ip + ':' + port);
            }
        });
    }

    return ips;
};

/**
 * Returns the date in the format DD-MM-YYYY
 * @param Date dateObj (optional)
 * @returns {string}
 */
Fetch.prototype.dateStamp = function(dateObj) {
    dateObj = dateObj || new Date();
    return dateObj.toISOString().split('T')[0].split('-').reverse().join('-');
};

/**
 * I like nice looking log output
 * Little log function to take advantage of ansi colours on the CL.
 * Takes as many arguments as you want, they'll be joined together to form the log string.
 * If you want to style start an argument with c: and then your colour(s) e.g.
 * this.log('c:bgGreen bold', 'This is bold text with a green background');
 */
Fetch.prototype.log = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = '';
    var skipNext = false;
    for (var i = 0; i < args.length; i++) {
        var arg = typeof args[i] == 'object' ? JSON.stringify(args[i]) : String(args[i]),
            next = typeof args[i] == 'object' ? JSON.stringify(args[i + 1]) : String(args[i + 1]);

        if (skipNext) {
            skipNext = false;
            continue;
        }

        if (arg && arg.substr(0,2) == 'c:') {
            var color = arg.substr(2, arg.length);
            color = color.split(' ');
            if (color.length == 1)
                msg += chalk[color[0]](next);
            else if (color.length == 2)
                msg += chalk[color[0]][color[1]](next);
            else if (color.length == 3)
                msg += chalk[color[0]][color[1]][color[2]](next);
            skipNext = true;
        }
        else {
            msg += arg;
            skipNext = false;
        }
    }

    var str = this.runTime() + chalk.grey('> ');
    var noAnsi = str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    var padding = Array(12).join(' ');
    var maxLength = 12;

    console.log(str + padding.substring(0, maxLength - noAnsi.length) + msg);
};

/**
 * Returns the duration
 * @param (optional) startTime
 * @returns {string}
 */
Fetch.prototype.runTime = function(startTime) {
    var millisecondDiff = new Date().getTime() - (typeof startTime !== 'undefined' ? startTime : this._startTime);

    var elapsed = {
        'days' : 0,
        'hours' : 0,
        'mins' : 0,
        'secs' : 0,
        'ms' : millisecondDiff
    };
    if (millisecondDiff > 0) {
        elapsed.ms = millisecondDiff % 1e3;
        millisecondDiff = Math.floor( millisecondDiff / 1e3 );
        elapsed.days = Math.floor( millisecondDiff / 86400 );
        millisecondDiff %= 86400;
        elapsed.hours = Math.floor ( millisecondDiff / 3600 );
        millisecondDiff %= 3600;
        elapsed.mins = Math.floor ( millisecondDiff / 60 );
        millisecondDiff %= 60;
        elapsed.secs = Math.floor( millisecondDiff  );
    }
    var showMs = true;
    var str = '';
    if (elapsed.days > 0) {
        str += chalk.bold(elapsed.days) +'d ';
        showMs = false;
    }
    if (elapsed.hours > 0) {
        str += chalk.bold(elapsed.hours) + 'h ';
        showMs = false;
    }
    if (elapsed.mins > 0) {
        str += chalk.bold(elapsed.mins) + 'm ' ;
    }
    if (( elapsed.secs > 0 && showMs ) || ( elapsed.secs === 0 && elapsed.ms > 0 ) ) {
        str += chalk.bold(elapsed.secs) + '.' + chalk.bold(elapsed.ms) + 's';
    }
    else if (elapsed.secs > 0) {
        str += chalk.bold(elapsed.secs) + 's';
    }
    return str;

};


Fetch.prototype.validateIpAddress = function(ip) {
    return ip.match(/\b(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
};

Fetch.prototype.userAgent = function() {
    var agents = [
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.80 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 4.4.2; SM-G900I Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/52.0.0.12.18;]',
        'Mozilla/5.0 (Linux; Android 4.2.2; en-za; SAMSUNG GT-I9190 Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Version/1.0 Chrome/18.0.1025.308 Mobile Safari/535.19',
        'Mozilla/5.0 (Linux; Android 5.1.1; SM-N910G Build/LMY47X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.76 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 4.4.2; en-za; SAMSUNG SM-G800H Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/1.6 Chrome/28.0.1500.94 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 4.4.2; HS-U961 Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPad; CPU OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1',
        'Mozilla/5.0 (Linux; U; Android 4.4.4; ko-kr; SHV-E210K/KTUKOB1 Build/KTU84P) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
        'Mozilla/5.0 (Linux; Android 5.0; E2303 Build/26.1.A.2.167) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.93 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 8_4_1 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) GSA/9.0.60246 Mobile/12H321 Safari/600.1.4',
        'Opera/9.80 (Android; Opera Mini/7.5.34817/37.7011; U; en) Presto/2.12.423 Version/12.16',
        'Mozilla/5.0 (Linux; Android 5.0; SAMSUNG SM-G900I Build/LRX21T) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.1 Chrome/34.0.1847.76 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 4.4.2; Retro Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; U; Android 4.1.1; en-us; SGH-T889 Build/JRO03C) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
    ];

    return agents[ Math.floor( Math.random() * agents.length ) ];
};


util.inherits(Fetch, EventEmitter);

// if we are being run as a command line app, execute our program
if (process.argv[1] == __filename) {
    var program = require("commander");
    program
        .version("0.0.1")
        .usage("[options] <keywords>")
        .option("-o, --output [output]", "Output file to save proxies.")
        .option("-u, --urls [urls]", "The url to make the requests to, comma separated. Use {page} to identify")
        .option("-r, --retry [retry]", "Retries every minute if set")
        .option("-v, --verbose", "Show verbose output")
        .parse(process.argv);

    var opts = {};
    if (program.output)
        opts.outputFile = program.output;
    if (program.urls)
        opts.urls = program.urls.split(',');
    if (program.retry)
        opts.retry = program.retry;
    if (program.verbose)
        opts.verbose = program.verbose;

    var fetch = new Fetch(opts);
    fetch.main();
}
else {
    module.exports = new Fetch();
}
