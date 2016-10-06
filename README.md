Proxy Fetch
================
fetch.js - A small NodeJS script to fetch proxies from a growing list of public proxy lists. This script is constantly updated and new lists are added all the time. proxy-fetch is written and maintained by [jthatch](https://github.com/jthatch).

![fetch.js screenshot](http://wireside.co.uk/fetch-screenshot.png)

This script can be used in conjunction with proxy-verify ( https://github.com/jthatch/proxy-verify ) to ensure the proxies are working (_which isn't always the case w/ these public lists_).

## Installation
fetch.js requires NodeJS and NPM, both of which are available via your default package manager, e.g. apt-get or yum. To install with a few commands, open a terminal and enter the following:
```
git clone https://github.com/jthatch/proxy-fetch.git
cd proxy-fetch
npm install
./fetch.js
```

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

`./fetch.js -u "POST:http://gatherproxy.com/proxylist/country/?Country=united%20states&PageIdx:{page:1/14}"`  
Support for POST: The get params will get converted into POST DATA 
