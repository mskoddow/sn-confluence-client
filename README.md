## About ConfluenceClient
### Summary

The ConfluenceClient API allows a ServiceNow instance to connect to a remote Confluence instance and provides a number of convenient methods for handling with Confluence content like searching or modififying pages.

### Motivation

The motivation for this project resulted from the following situation: In my company we have an on premise installation of Confluence with lots of plugins - including "Scaffolding" from ServiceRocket. In one of the Confluence spaces exist more than 14000 pages and a majority of them have forms, which have been implemented by macros of that plugin. Performing some reconstructions on such a huge amount of form pages would cause some urgent problem, as there is no possibility to perform these reconstructions with board tools provided by Confluence. However, both Confluence and the Scaffolding plugin offer a REST based API that allows you to implement just about anything you need:

- Confluence Server: [https://docs.atlassian.com/ConfluenceServer/rest/latest](https://docs.atlassian.com/ConfluenceServer/rest/latest)
- Confluence Cloud: [https://developer.atlassian.com/cloud/confluence/rest](https://developer.atlassian.com/cloud/confluence/rest)
- Scaffolding Plugin: [https://docs.servicerocket.com/scaffolding/developer-guide/scaffolding-rest-api](https://docs.servicerocket.com/scaffolding/developer-guide/scaffolding-rest-api)

And so I started implementing a client that encapsulates the REST APIs in simple JavaScript methods, making it very easy to load, modify and return Confluence pages. Currently, the Script Include is limited to methods for handling Confluence pages. However, I'm pleased to get feedback and wishes to extend the Confluence client further, so it's worth watching this project and waiting for the next releases.

### What it is not

ConfluenceClient is not 
- a ready-to-go application or
- an [IntegrationHub](https://docs.servicenow.com/bundle/paris-servicenow-platform/page/administer/integrationhub/concept/integrationhub.html) spoke.

## Use Cases

### Bulk Changes

Retrieve a set of Confluence pages based on a query or on a common ancestor and do some bulk operations such as adding title prefixes, fixing macro code or replacing labels.

Also manipulation of form data provided by the [Scaffolding Plugin](https://marketplace.atlassian.com/apps/190/scaffolding-forms-templates) is possible!

### Quality Assurance

Search for Confluence pages that do not meet the specified quality requirements and trigger appropriate actions such as notifying the page modifier.

### Security Checks

Crawl a set of Confluence pages and check whether each page has the required minimum restrictions. Especially the writing restrictions are problematic, as they have to be reassigned for each page and are not inherited, unlike the reading restrictions.

### Link Checker
Iterate over all external links of a Confluence page and check whether URLs are available or not.

```javascript
var strHrefPattern = /<a.*?href="(.*?)"/g;

while (arrMatches = strHrefPattern.exec(objPage.getBody())) {
  var strUrl        = arrMatches[1];
  var objHttRequest = new GlideHTTPRequest(strUrl);
  var objGet        = objHttRequest.get();
  
  if (!(objGet && objGet.getStatusCode() == 200)) { 
    gs.error("URL '" + strUrl + "' is not reachable!");
  }
}
```


## Usage

The ConfluenceClient consists of only one Script Include which makes it very easy to integrate and use the API in your own applications.

When creating a new ConfluenceClient object you just have to specify the URL to your Confluence instance:
```javascript
var confluenceClient = new ConfluenceClient("<YOUR DOMAIN>");
```

Requests to the configured Confluence instance are done with the help of the [`RESTMessageV2 API`](https://developer.servicenow.com/dev.do#!/reference/api/orlando/server/sn_ws-namespace/c_RESTMessageV2API).

Authentification against Confluence has to be specified by a so-called authentification profile with a type (`basic`or `oauth2`) and the `sys_id` of the corresponding record. 
```javascript
confluenceClient.getRestMessageObject().setAuthenticationProfile("basic", "<SYS ID>");
```

For more information please see [API documentation](https://developer.servicenow.com/dev.do#!/reference/api/orlando/server/sn_ws-namespace/c_RESTMessageV2API#r_RMV2-setAuthenticationProfile_S_S).

Now you can start requesting Confluence, for example load a single page by its space key and title:
```javascript
var objPage = confluenceClient.loadPageDataByTitle("TST", "2020-07-24 - Team Meeting");
```

## Full Example
The following example code demonstrates how to repair Confluence pages by replacing a broken macro with a fixed version of it:
```javascript
var brokenMacro = '<ri:page ri:space-key="[ContentPage] Protocol" ri:content-title=" Team-Meeting &gt; renderJiraReminder" />';
var fixedMacro = '<ri:page ri:content-title="[ContentPage] Protocol &gt; Team-Meeting &gt; renderJiraReminder" />';
 
// Instantiate a Confluence Client object with the URL of your Confluence instance
// Note: replace <YOUR DOMAIN> with complete URL to your Confluence instance
var confluenceClient = new ConfluenceClient("<YOUR DOMAIN>");
 
// Note: replace <SYS ID> with the sys_id of the corresponding Authentification record
confluenceClient.getRestMessageObject().setAuthenticationProfile("basic", "<SYS ID>");
 
// Load all child pages of given parent page inclusive page content
// Note: replace <PAGE ID> with the ID of your Confluence page
var arrPages = confluenceClient.loadPageChildren(<PAGE ID>, true);
 
if (arrPages != null) {
  gs.info("Found " + arrPages.length + " pages");
   
  // Iterate over all pages
  arrPages.forEach(function(objPage) {
    if (objPage.getBody().indexOf(brokenMacro) != -1) {
      // Replace broken macro with fixed version
      objPage.setBody(objPage.getBody().replace(brokenMacro, fixedMacro));
 
      // write page back to Confluence
      if (!objPage.updatePageData()) {
        gs.error(confluenceClient.getLastErrorMessage());
      }
    }
  });
}
else {
  gs.error(confluenceClient.getLastErrorMessage());
}
```
## API documentation
The JavaScript code is well commented and prepared for generating an HTML based documentation via [jsdoc](https://jsdoc.app/).

## Author
[Maik Skoddow](https://account.servicenow.com/personal-data/11ea1a505/b75059d80/a806e4a75/ae71eB9T9/resume.html)

## License
This project is distributed under the Apache 2.0 license. See [https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0) for more information.

## Release Notes
### v0.6
#### General
- Internal refactoring and code optimizations.
- Some documentation fixes.
- Minor bugfix for updating page data

### v0.52
#### General
- Internal refactoring and code optimizations.
- Some documentation fixes.
- When fetching Confluence pages response data now includes information regarding page restrictions. That information is offered by four new getters at `ConfluencePage`.

#### Object `ConfluenceClient`
- Renamed method `loadPageData` to `loadPageDataById`.
- New method `loadPageDataByTitle`allows fetching a Confluence page by its title.

#### Object `ConfluencePage`
New methods:
- `getUserReadingRestrictions()`
- `getUserUpdatingRestrictions()`
- `getGroupReadingRestrictions()`
- `getGroupUpdatingRestrictions()`

### v0.51
#### General
- Internal refactoring and code optimizations.

#### Object `ConfluenceClient`
New methods:
- `removePage()`: Moves a Confluence page to the recycle bin of corresponding space.

#### Object `ConfluencePage`
New methods:
- `remove()`
- `getStatus()`
- `getAncestors()`
- `getModifierUserName()`
- `getModifierFullName()`
- `getModificationDateTime()`
