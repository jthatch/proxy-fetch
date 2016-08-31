Fetch Proxy (NodeJS)
================
fetch.js - Fetches proxies from the following sites that have public proxy lists:
* http://proxylist.hidemyass.com/search-1292985/1 (__300-900__ proxies)
* http://incloak.com/proxy-list/#list (__250-400__ proxies)
* http://proxy-list.org/english/index.php?p=1 (__140__ proxies)
* https://nordvpn.com/wp-admin/admin-ajax.php... (__500-1000__ proxies, low success rate)
* http://www.cool-proxy.net/proxies/... (__200__ proxies)

Hidemyass is pretty tricky as they obfuscate the ip's using a few dirty techniques.. Not to worry though :)

I'd recommend running this every couple of hours if you want to maximize your mining, easy to do:
`./fetch.js --retry=120`       (will retry every 2 hrs)

By default it will append any proxies found to a file in __./proxies/fetched/fetched_proxies_DD_MM_YYYY.txt__
You can override this with the `-o` flag, e.g. `./fetch.js -o proxies.txt`

This script can be used in conjunction with proxy-verify ( https://github.com/jthatch/proxy-verify ) to ensure the proxies are working (_which isn't always the case w/ these public lists_).

proxy-fetch is written and maintained by [jthatch](https://github.com/jthatch).

![fetch.js screenshot](http://wireside.co.uk/fetch-screenshot.png)

## Installation
fetch.js requires NodeJS and NPM, both of which are available via your default package manager, e.g. apt-get or yum. To install with a few commands, open a terminal and enter the following:
```
git clone https://github.com/jthatch/proxy-fetch.git
cd proxy-fetch
npm install
```

## Notes
fetch.js is built to work alongside a [proxy-verify](https://github.com/jthatch/proxy-verify), so grab this to ensure your proxies are working.

## Usage
*fetch.js should automatically be marked as executable, if not enter `chmod +x fetch.js`*

`./fetch.js`  
Default Behaviour. Fetch proxies from the list of public proxy sites and store them in proxies/fetched/fetched_proxies_DD_MM_YYYY.txt.  

`./fetch.js -o proxies.txt`  
Output the proxies to a custom file, in this case proxies.txt in the CWD.  

`./fetch.js -u "http://proxylist.hidemyass.com/search-1292985/{page}"`  
Specify a custom page to look for proxies. NOTE: `{page}` is a variable that will be incremented by 1 each request until the script can no longer find proxies.

`./fetch.js -u "http://incloak.com/proxy-list/?start={page:0-64}"`  
Advanced usage: `{page:0-64}` tells the script to start from page 0 and increment by 64 at a time.
