/*eslint-disable multiline-comment-style*/
/*global Class, gs, sn_ws, GlideDateTime */

/**************************************************************************
 * Copyright 2020 Maik Skoddow
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. 
 *****************************************************************************/

var ConfluenceClient = Class.create();
var ConfluencePage   = Class.create();

/**
 * Initializes a new ConfluenceClient object.
 * 
 * @class ConfluenceClient
 * @author Maik Skoddow
 * @version 0.6
 * @param {String} strConfluenceURL The complete base URL to your Confluence instance.
 * @throws {Error} If parameter `strConfluenceURL` does not represent a valid URL.
 */
ConfluenceClient.prototype = {
    initialize: function(strConfluenceURL) {		
		if (!ConfluenceClient.isValidURL(strConfluenceURL)) {
			throw new Error(
				"[ConfluenceClient.initialize] Please pass a valid Confluence URL at parameter {strConfluenceURL}!"
			);
		}
		
		this._strConfluenceURL = strConfluenceURL;
		this._strErrorMsg      = "";
		this._strInternalId    = gs.nowGlideDateTime().getNumericValue() + gs.getSessionID();
		this._logDebugMessages = false;

		try {
			this._objRestMessage = new sn_ws.RESTMessageV2();
		}
		catch (e) {
			throw new Error(
				"[ConfluenceClient.initialize] Object {sn_ws.RESTMessageV2} could not be instantiated!"
			);
		}
		
		this._objRestMessage.setRequestHeader("Accept","application/json");
		this._objRestMessage.setRequestHeader("Content-Type","application/json");
		this._objRestMessage.setHttpTimeout(10000);
		this._objRestMessage.setLogLevel("all");
    },
	

	/**
	 * Activates the debugging mode for getting more detailed information at the system log.
	 */
	enableDebugMessages: function() {
		this._logDebugMessages = true;
	},
	

	/**
	 * Returns a reference to the underlying and preconfigured [sn_ws.RESTMessageV2]{@link https://developer.servicenow.com/dev.do#!/reference/api/orlando/server/sn_ws-namespace/c_RESTMessageV2API} object.
	 *
	 * @returns {Object} Reference to a [sn_ws.RESTMessageV2]{@link https://developer.servicenow.com/dev.do#!/reference/api/orlando/server/sn_ws-namespace/c_RESTMessageV2API} object
	 */
	getRestMessageObject: function() {
		return this._objRestMessage;
	},
	

	/**
	 * Getter for the previously logged error message in case a function returns `NULL` or `false`.
	 * 
	 * @returns {String} The internally stored error message of the last failed function.
	 */
	getLastErrorMessage: function() {
		return this._strErrorMsg;
	},
	

	/**
	 * Sends a GET request to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/search-search}. 
	 * The search syntax has to follow the [(C)onfluence (Q)uery (L)anguage]{@link https://developer.atlassian.com/server/confluence/advanced-searching-using-cql}.
	 *
	 * @param {String} strCQL CQL based query 
	 * @param {Boolean} [includeContent] If set to `true` page body contents will be included.
	 * @returns {null|Array<ConfluencePage>} `NULL` if Confluence request has failed or an Array with objects of type {@link ConfluencePage} representing the corresponding Confluence pages.
	 * @throws {Error} If parameter `strCQL` does not represent a value of type `String` or if it is empty.
	 */
	searchPages: function(strCQL, includeContent) {
		if (!(typeof strCQL == "string" && strCQL.trim().length > 5)) {
			throw new Error(
				"[ConfluenceClient.searchPages] Please pass a valid CQL string at parameter {strCQL}!"
			);
			
		}
		
		var strFinalCQL = strCQL.trim();
		var arrPages    = [];
		var intStartAt  = 0;

		//restrict search results to pages
		if (strCQL.toLowerCase().indexOf("type=page") == -1) {
			strFinalCQL += " AND type=page";
		}

		try {
			while (true) {
				//configure request
				this._setHttpMethod("get");
				this._setEndpoint(
					"/rest/api/content/search" +
					"?limit=1000" +
					"&start=" + intStartAt + 
					"&cql=" + encodeURIComponent(strFinalCQL) + 
					"&expand=" + this._getCommonExpansions(includeContent)					
				);

				//send request
				var objResponse = this._executeRequest("ConfluenceClient.searchPages");
				
				//test whether response is successful
				if (objResponse.getStatusCode() == 200) {
					var jsonResponse = JSON.parse(objResponse.getBody());
					var intSize      = jsonResponse.results.length || 0;				
					
					this._logDebug(
						"[ConfluenceClient.searchPages] " + intSize + " results for CQL = '" + strFinalCQL + "' loaded."
					);

					if (intSize == 0) {
						break;
					}
					
					for (var i = 0; i < intSize; i++) {				
						arrPages.push(new ConfluencePage(this, jsonResponse.results[i]));
					}

					intStartAt += intSize;
				}
				else {
					return null;
				}
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.searchPages", e);
			return null;
		}

		return arrPages;
	},
	

	/**
	 * Invokes method {@link ConfluenceClient#searchPages} for retrieving all child pages below a given parent page.
	 * 
	 * @param {String} strParentId ID of the Confluence page whose children are to be loaded.
	 * @param {Boolean} [includeContent] If set to `true` also the page content will be loaded.
	 * @throws {Error} If parameter `strParentId` does not contain a valid Integer value.
	 * @returns {null|Array<ConfluencePage>} `null` if Confluence request has failed or an Array with objects of type {@link ConfluencePage} representing the corresponding Confluence pages.
	 */
	loadPageChildren: function(strParentId, includeContent) {
		if (!ConfluenceClient.isValidInteger(strParentId)) {
			throw new Error(
				"[ConfluenceClient.loadPageChildren] Please pass a valid Confluence page ID at parameter {strParentId}!"
			);
		}
		
		var arrPages   = [];
		var intStartAt = 0;
		
		try {
			while (true) {
				//configure request
				this._setHttpMethod("get");
				this._setEndpoint(
					"/rest/api/content/" + strParentId + "/child/page" +
					"?limit=1000" +
					"&start=" + intStartAt + 
					"&expand=" + this._getCommonExpansions(includeContent)				
				);

				//send request
				var objResponse = this._executeRequest("ConfluenceClient.loadPageChildren");
				
				//test whether response is successful
				if (objResponse.getStatusCode() == 200) {
					var jsonResponse = JSON.parse(objResponse.getBody());
					var intSize      = jsonResponse.results.length || 0;
					
					this._logDebug("[ConfluenceClient.loadPageChildren] " + intSize + " results loaded");

					if (intSize == 0) {
						break;
					}
	
					for (var i = 0; i < intSize; i++) {				
						arrPages.push(new ConfluencePage(this, jsonResponse.results[i]));
					}

					intStartAt += intSize;
				}
				else {
					return null;
				}
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.loadPageChildren", e);
			return null;
		}

		return arrPages;				
	},
	
	
	/**
	 * Invokes method {@link ConfluenceClient#searchPages} for retrieving all descendant pages below a given parent page.
	 * 
	 * @param {String} strParentId ID of the Confluence page whose descendants are to be loaded.
	 * @param {Boolean} [includeContent] If set to `true` also the page content will be loaded.
	 * @throws {Error} If parameter `strParentId` does not contain a valid Integer value.
	 * @returns {null|Array<ConfluencePage>} `NULL` if Confluence request has failed or an Array with objects of type {@link ConfluencePage} representing the corresponding Confluence pages.
	 */
	loadPageDescendants: function(strParentId, includeContent) {
		if (!ConfluenceClient.isValidInteger(strParentId)) {
			throw new Error(
				"[ConfluenceClient.loadPageDescendants] Please pass a valid Confluence page ID at parameter {strParentId}!"
			);
		}
		
		return this.searchPages("ancestor=" + strParentId, includeContent);
	},


	/**
	 * Sends a GET request to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/content-getContentById} for retrieving page data inclusive body content. 
	 * 
	 * @param {String} intId ID of the Confluence page to be loaded.
	 * @throws {Error} If parameter `intId` does not contain a valid Integer value.
	 * @returns {null|ConfluencePage} `null` if Confluence request has failed or an {@link ConfluencePage} object representing the corresponding Confluence page data.
	 */
	loadPageDataById: function(intId) {
		if (!ConfluenceClient.isValidInteger(intId)) {
			throw new Error(
				"[ConfluenceClient.loadPageDataById] Please pass a valid Confluence page ID at parameter {intId}!"
			);
		}
		
		try {
			//configure request
			this._setHttpMethod("get");
			this._setEndpoint("/rest/api/content/" + intId + "?expand=" + this._getCommonExpansions(true));
			
			//send request
			var objResponse = this._executeRequest("ConfluenceClient.loadPageDataById");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				return new ConfluencePage(this, JSON.parse(objResponse.getBody()));
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.loadPageDataById", e);
		}
		
		return null;
	},
	
	/**
	 * Sends a GET request to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/content-getContent} for retrieving page data inclusive body content. 
	 * 
	 * @param {String} strSpaceKey Key of the Confluence space the requested Confluence page resides in.
	 * @param {String} strPageTitle Title of the Confluence page to be loaded.
	 * @throws {Error} If parameter `strSpaceKey` does not contain a valid space key.
	 * @throws {Error} If parameter `strPageTitle` does not contain a valid page title.
	 * @returns {null|ConfluencePage} `NULL` if Confluence request has failed or an {@link ConfluencePage} object representing the corresponding Confluence page data.
	 */
	loadPageDataByTitle: function(strSpaceKey, strPageTitle) {
		if (!ConfluenceClient.isValidSpaceKey(strSpaceKey)) {
			throw new Error(
				"[ConfluenceClient.loadPageDataByTitle] Please pass a valid Confluence page ID at parameter {intId}!"
			);
		}
		
		if (!(typeof strPageTitle === "string" && strPageTitle.length > 0)) {
			throw new Error(
				"[ConfluenceClient.loadPageDataByTitle] Please pass a valid Confluence page title at parameter {strPageTitle}!"
			);
		}

		try {
			//configure request
			this._setHttpMethod("get");
			this._setEndpoint(
				"/rest/api/content" +
				"?spaceKey=" + encodeURIComponent(strSpaceKey) + 
				"&title=" + encodeURIComponent(strPageTitle) +
				"&expand=" + this._getCommonExpansions(true)
			);
			
			//send request
			var objResponse = this._executeRequest("ConfluenceClient.loadPageDataByTitle");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				var jsonResponse = JSON.parse(objResponse.getBody());

				if (Array.isArray(jsonResponse.results) && jsonResponse.results.length > 0) {
					return new ConfluencePage(this, jsonResponse.results[0]);
				}
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.loadPageDataByTitle", e);
		}
		
		return null;
	},

	/**
	 * Sends a GET request to the [Scaffolding REST API]{@link https://docs.servicerocket.com/scaffolding/developer-guide/scaffolding-rest-api} for retrieving all form data.
	 * 
	 * @param {String} intId ID of the Confluence page whoose Scaffolding data should be loaded.
	 * @param {String} strAllowedFields List of all fields that should be loaded into the returned page object. If not specified or empty all available fields will be returned.
	 * @throws {Error} If parameter `param` does not contain a valid Integer value.
	 * @returns {null|Object} `NULL` if requesting the Scaffolding data has failed or an JSON object representing the corresponding Scaffolding data.
	 */
	loadScaffoldingData: function(intId, strAllowedFields) {
		if (!ConfluenceClient.isValidInteger(intId)) {
			throw new Error(
				"[ConfluenceClient.loadScaffoldingData] Please pass a valid Confluence page ID at parameter {intId}!"
			);
		}
		
		try {
			//configure request
			this._setEndpoint("/rest/scaffolding/1.0/api/form/" + intId);
			this._setHttpMethod("get");
			
			//send request
			var objResponse = this._executeRequest("ConfluenceClient.loadScaffoldingData");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				var jsonResponse = objResponse.getBody().length > 2 ? JSON.parse(objResponse.getBody()) : [];
				
				//filter allowed Scaffolding fields by name
				if (typeof strAllowedFields === "string" && strAllowedFields.length > 0) {
					return jsonResponse.filter(
						function(value, index, arr) {
							return strAllowedFields.indexOf(value.name) != -1;
						}
					);
				}

				return jsonResponse;
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.loadScaffoldingData", e);
		}
		
		return null;
	},

	/**
	 * Sends a PUT request to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/content-update} for writing back page data to Confluence. 
	 * 
	 * @param {ConfluencePage} objPage A valid {@link ConfluencePage} object.
	 * @param {Boolean} [suppressNotifications] If `true` no email notifications will be sent to watchers.
	 * @throws {Error} If parameter `objPage` does not represent a valid {@link ConfluencePage}.
	 * @throws {Error} If `objPage` does not hold the minimum field values for updating a Confluence page.
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */
	updatePageData: function(objPage, suppressNotifications) {
		if (!this._isValidPageObj(objPage)) {
			throw new Error(
				"[ConfluenceClient.updatePageData] Please pass a valid {ConfluencePage} object at parameter {objPage}!"
			);			
		}
		
		if (!(objPage.getId() && objPage.getVersionNumber() && objPage.getParentPageId() && 
			objPage.getTitle() && objPage.getSpaceKey())) {
			throw new Error(
				"[ConfluenceClient.updatePageData] {objPage} has not the minimum values for updating the Confluence page!"
			);			
		}
		
		try {
			//configure request
			this._setEndpoint("/rest/api/content/" + objPage.getId());
			this._setHttpMethod("put");
			this._setRequestBody(objPage.stringify(false, suppressNotifications));

			//send request
			var objResponse = this._executeRequest("ConfluenceClient.updatePageData");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				var objReturnedPage = new ConfluencePage(this, JSON.parse(objResponse.getBody()));
				
				//if nothing has changed Confluence will not create a new page version and therefore the retrieved 
				//page version is written back to page object to be sure that the next update call has the correct one.
				objPage.setVersionNumber(objReturnedPage.getVersionNumber());
				
				return true;
			}		
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.updatePageData", e);
		}
		
		return false;
	},
	
	
	/**
	 * Sends a PUT request to the [Scaffolding REST API]{@link https://docs.servicerocket.com/scaffolding/developer-guide/scaffolding-rest-api} for writing back scaffolding data to Confluence.
	 * 
	 * @throws {Error} If parameter `objPage` does not represent a valid {@link ConfluencePage}.
	 * @throws {Error} If `objPage` does not have any Scaffolding data. Use {@link ConfluenceClient#loadScaffoldingData} first!
	 * @param {ConfluencePage} objPage a valid {@link ConfluencePage}
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */
	updateScaffoldingData: function(objPage) {
		if (!this._isValidPageObj(objPage)) {
			throw new Error(
				"[ConfluenceClient.updateScaffoldingData] Please pass a valid {ConfluencePage} object at parameter {objPage}!"
			);			
		}
		
		if (!objPage.getScaffoldingData()) {
			throw new Error(
				"[ConfluenceClient.updateScaffoldingData] {objPage} has no scaffolding values for updating! Please use method 'loadScaffoldingData' first!"
			);			
		}
		
		try {
			//configure request
			this._setEndpoint("/rest/scaffolding/1.0/api/form/" + objPage.getId());
			this._setHttpMethod("put");
			this._setRequestBody(JSON.stringify(objPage.getScaffoldingData()));

			//send request
			var objResponse = this._executeRequest("ConfluenceClient.updateScaffoldingData");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				//in case of later call of 'updatePageData()' internal version number has to be increased 
				objPage.increaseVersionNumber();
								
				return true;
			}

			//Scaffolding API seems to respond with status code 304 if local data is indentical to the data on the server
			if (objResponse.getStatusCode() == 304) {
				return true;
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.updateScaffoldingData", e);
		}
		
		return false;
	},	
	

	/**
	 * Sends a POST request to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/content-createContent} for creating a new Confluence page. 
	 * 
	 * @throws {Error} If parameter `objPage` does not represent a valid {@link ConfluencePage} object.
	 * @throws {Error} If parameter `objPage` does not represent a {@link ConfluencePage} having all values that are mandatory for new Confluence pages.
	 * @param {ConfluencePage} objPage A reference to a valid {@link ConfluencePage} object.
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */	
	createPage: function(objPage) {
		if (!this._isValidPageObj(objPage)) {
			throw new Error(
				"[ConfluenceClient.createPage] Please pass a valid {ConfluencePage} object at parameter {objPage}!"
			);			
		}
		
		if (!(objPage.getParentPageId() && objPage.getTitle() && objPage.getSpaceKey())) {
			throw new Error(
				"[ConfluenceClient.createPage] {objPage} has not the minimum values for creating a new page!"
			);			
		}

		try {
			//configure request
			this._setEndpoint("/rest/api/content");
			this._setHttpMethod("post");
			this._setRequestBody(objPage.stringify(true));

			//send request
			var objResponse = this._executeRequest("ConfluenceClient.createPage");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200) {
				var objReturnedPage = new ConfluencePage(this, JSON.parse(objResponse.getBody()));
				
				objPage.setId(objReturnedPage.getId());
				objPage.setStatus("current");
				objPage.setVersionNumber(objReturnedPage.getVersionNumber());

				return true;
			}
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.createPage", e);
		}
		
		return false;
	},
	
	/**
	 * Sends GET and DELETE requests to the [Confluence REST API]{@link https://docs.atlassian.com/ConfluenceServer/rest/latest/#api/content/id/label}
	 * to create the same list of page labels on the server side as the {@link ConfluencePage} object has.
	 * 
	 * @param {ConfluencePage} objPage A reference to a valid {@link ConfluencePage} object.
	 * @throws {Error} If parameter `objPage` does not represent a valid {@link ConfluencePage} object.
	 * @throws {Error} If parameter `objPage` does not have a page ID stored.
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */
	updatePageLabels: function(objPage) {
		if (!this._isValidPageObj(objPage)) {
			throw new Error(
				"[ConfluenceClient.updatePageLabels] Please pass a valid {ConfluencePage} object at parameter {objPage}!"
			);			
		}

		if (!objPage.getId()) {
			throw new Error(
				"[ConfluenceClient.updatePageLabels] {objPage} has no page ID stored!"
			);			
		}


		try {
			var objResponse;

			//configure request
			this._setEndpoint("/rest/api/content/" + objPage.getId() + "/label");
			this._setHttpMethod("get");
			
			//send request
			objResponse = this._executeRequest("ConfluenceClient.updatePageLabels");
			
			//test whether response is successful
			if (objResponse.getStatusCode() != 200) {
				return false;
			}

			var objResult       = JSON.parse(objResponse.getBody());
			var intSize         = objResult.size || 0;
			var arrRemoteLabels = intSize > 0 ? objResult.results : [];
			var arrLocalLabels  = objPage.getLabels() || [];
			var result          = true;

			for (var a = 0; a < arrRemoteLabels.length; a++) {
				var existsLocally = false;

				for (var b = 0; b < arrLocalLabels.length; b++) {
					if (arrRemoteLabels[a].prefix == arrLocalLabels[b].prefix &&
						arrRemoteLabels[a].name == arrLocalLabels[b].name) {
							existsLocally = true;
					}
				}

				//if label does not exists locally it has to be removed on the service side
				if (!existsLocally) {
					//configure request
					this._setEndpoint(
						"/rest/api/content/" + objPage.getId() + "/label" + 
						"?name=" + encodeURIComponent(arrRemoteLabels[a].name)
					);
					this._setHttpMethod("delete");
					this._setRequestBody("x");

					//send request
					objResponse = this._executeRequest("ConfluenceClient.updatePageLabels");

					if (objResponse.getStatusCode() != 204) {
						result = false;
					}
				}			
			}

			for (var c = 0; c < arrLocalLabels.length; c++) {
				var updateLabels = false;

				for (var d = 0; d < arrRemoteLabels.length; d++) {
					if (arrLocalLabels[c].prefix == arrRemoteLabels[d].prefix &&
						arrLocalLabels[c].name == arrRemoteLabels[d].name) {
						updateLabels = true;
					}
				}

				if (!updateLabels) {
					//configure request
					this._setEndpoint("/rest/api/content/" + objPage.getId() + "/label");
					this._setHttpMethod("post");
					this._setRequestBody(JSON.stringify(arrLocalLabels[c]));

					//send request
					objResponse = this._executeRequest("ConfluenceClient.updatePageLabels");

					if (objResponse.getStatusCode() != 200) {
						result = false;
					}
				}
			}

			return result;
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.updatePageLabels", e);
			return false;
		}
	},

	/**
	 * Deletes a Confluence page by moving to the recycle bin of the corresponding space.
	 * 
	 * @param {ConfluencePage} objPage A reference to a valid {@link ConfluencePage} object.
	 * @throws {Error} If parameter `objPage` does not represent a valid {@link ConfluencePage} object.
	 * @throws {Error} If parameter `objPage` does not have a page ID stored.
	 * @throws {Error} If given {@link ConfluencePage} object has status 'trashed'.
	 * @returns {Booelan} `true` if page could be moved to the recycle bin or `false`if not.
	 */
	removePage: function(objPage) {
		if (!this._isValidPageObj(objPage)) {
			throw new Error(
				"[ConfluenceClient.removePage] Please pass a valid {ConfluencePage} object at parameter {objPage}!"
			);			
		}

		if (!objPage.getId()) {
			throw new Error("[ConfluenceClient.removePage] {objPage} has no page ID stored!");			
		}

		if (objPage.getStatus() === "trashed") {
			throw new Error("[ConfluenceClient.removePage] Given {objPage} is already in status 'trashed'!");			
		}

		try {
			//configure request
			this._setEndpoint("/rest/api/content/" + objPage.getId());
			this._setHttpMethod("delete");

			//tough it is not necessary ServiceNow would throw an error in case of empty request body
			this._setRequestBody("x");
			
			//send request
			var objResponse = this._executeRequest("ConfluenceClient.removePage");
			
			//test whether response is successful
			if (objResponse.getStatusCode() == 200 || objResponse.getStatusCode() == 204) {
				objPage.setStatus("trashed");

				return true;
			} 
		}
		catch (e) {
			this._logCaughtError("ConfluenceClient.removePage", e);
		}

		return false;
	},
	
	_getCommonExpansions: function(includeContent) {
		var strExpand = "version," + 
						"space," +
						"metadata.labels," +
						"history.lastUpdated," +
						"restrictions.read.restrictions.group," +
						"restrictions.update.restrictions.group," +
						"restrictions.read.restrictions.user," +
						"restrictions.update.restrictions.user," + 
						"ancestors," +
						"ancestors.version," + 
						"ancestors.space," +
						"ancestors.metadata.labels," +
						"ancestors.history.lastUpdated," +
						"ancestors.restrictions.read.restrictions.group," +
						"ancestors.restrictions.update.restrictions.group," +
						"ancestors.restrictions.read.restrictions.user," +
						"ancestors.restrictions.update.restrictions.user";

		if (typeof includeContent === "boolean" && includeContent == true) {
			strExpand = strExpand + ",body.storage,body.styled_view";
		}						

		return strExpand;
	},

	_isValidPageObj: function(objPage) {
		return typeof objPage === "object" && objPage instanceof ConfluencePage && objPage.isValid();
	},
		
	_setEndpoint: function(strSuffix) {
		this._endpoint = this._strConfluenceURL + strSuffix;

		this._objRestMessage.setEndpoint(this._endpoint);
	},
	
	_setHttpMethod: function(strHttpMethod) {
		this._httpMethod = strHttpMethod;

		this._objRestMessage.setHttpMethod(strHttpMethod);
	},

	_setRequestBody: function(strRequestBody) {
		this._objRestMessage.setRequestBody(strRequestBody);
	},

	_executeRequest: function(strMethodName) {
		this._logRequest(strMethodName);

		this._objResponse = this._objRestMessage.execute();
		
		this._logResponse(strMethodName);

		return this._objResponse;
	},

	_logRequest: function(strMethodName) {
		if (this._logDebugMessages) {
			this._logDebug(
				"[" + strMethodName + "] Send HTTP request with\n" +
				"#Method = '" + this._httpMethod + "'\n" +
				"#Endpoint = '" + this._objRestMessage.getEndpoint() + "'\n" +
				"#Request headers = " + JSON.stringify(this._objRestMessage.getRequestHeaders()) + "\n" +
				"#Request body = " + this._objRestMessage.getRequestBody()
			);
		}
	},

	_logResponse: function(strMethodName) {
		if (this._objResponse.haveError()) {
			this._logError(
				"[" + strMethodName + "] Requesting '" + this._endpoint + "' returned an error response with\n" +
				"#Status code = '" + this._objResponse.getStatusCode() + "'\n" +
				"#Error code = '" + this._objResponse.getErrorCode() + "'\n" +
				"#Error message = '" + this._objResponse.getErrorMessage() + "'\n"  +
				"#Response headers = " + JSON.stringify(this._objResponse.getHeaders()) + "\n" +
				"#Response body = '" + this._objResponse.getBody() + "'"
			);
		}
		else {
			this._logDebug(
				"[" + strMethodName + "] Requesting '" + this._endpoint + "' with HTTP-Method '" + this._httpMethod + "' returned a response with\n" +
				"#Status code = '" + this._objResponse.getStatusCode() + "'\n" +
				"#Response headers = " + JSON.stringify(this._objResponse.getHeaders()) + "\n" +
				"#Response body = " + this._objResponse.getBody()
			);
		}
	},

	_logDebug: function(strMessage) {
		if (this._logDebugMessages == true) {
			gs.info(strMessage);
		}
	},

	_logError: function(strMessage) {
		this._strErrorMsg = strMessage;
		
		gs.error(strMessage);
	},
	
	_logCaughtError: function(strScope, e) {
		this._strErrorMsg = '[' + strScope + '] ' + e.name + (e.lineNumber ? ' at line ' + e.lineNumber : '') + ':\n' + e.message;
		
		gs.error(this._strErrorMsg);
	},
		
    type: 'ConfluenceClient',
};

/**
 * Tests whether a given value represents a valid URL.
 * 
 * @param {*} param URL to be tested, **NOTE:** method `toString()` is invoked on `param`.
 * @returns {Boolean} `true` if passed value represents a valid URL, otherwise `false`.
 */
ConfluenceClient.isValidURL = function(param) { 
	//eslint-disable-next-line no-useless-escape
	return /^(http|https):\/\/(([a-zA-Z0-9$\-_.+!*'(),;:&=]|%[0-9a-fA-F]{2})+@)?(((25[0-5]|2[0-4][0-9]|[0-1][0-9][0-9]|[1-9][0-9]|[0-9])(\.(25[0-5]|2[0-4][0-9]|[0-1][0-9][0-9]|[1-9][0-9]|[0-9])){3})|localhost|([a-zA-Z0-9\-\u00C0-\u017F]+\.)+([a-zA-Z]{2,}))(:[0-9]+)?(\/(([a-zA-Z0-9$\-_.+!*'(),;:@&=]|%[0-9a-fA-F]{2})*(\/([a-zA-Z0-9$\-_.+!*'(),;:@&=]|%[0-9a-fA-F]{2})*)*)?(\?([a-zA-Z0-9$\-_.+!*'(),;:@&=\/?]|%[0-9a-fA-F]{2})*)?(\#([a-zA-Z0-9$\-_.+!*'(),;:@&=\/?]|%[0-9a-fA-F]{2})*)?)?$/.test(param.toString());
};

/**
 * Tests whether given value represents a valid and positive Integer value.
 * 
 * @param {*} param Integer value to be tested, **NOTE:** method `toString()` is invoked on `param`.
 * @returns {Boolean} `true` if passed value represents a valid Integer, otherwise `false`.
 */
ConfluenceClient.isValidInteger = function(param) {
	return /^[0-9]{1,}$/.test(param.toString());
};

/**
 * Tests whether given value at parameter `param` represents a valid Confluence label name.
 * 
 * @param {*} param - Label name to be tested, **NOTE:** method `toString()` is invoked on `param`.
 * @returns {Boolean} `true` if passed value represents a valid Label name, otherwise `false`.
 */
ConfluenceClient.isValidLabelName = function(param) {
	return /^[0-9a-zA-Z_-~{}%+]{1,}$/.test(param.toString());
};

/**
 * Tests whether given value at parameter `param` represents a valid Confluence space key.
 * 
 * @param {*} param - Space key to be tested, **NOTE:** method `toString()` is invoked on `param`.
 * @returns {Boolean} `true` if passed value represents a valid Confluence space key, otherwise `false`.
 */
ConfluenceClient.isValidSpaceKey = function(param) {
	return /^(~)?[0-9a-z]{3,255}$/.test(param.toString());
};


/**
 * This object represents a single Confluence Page and encapsulates all data and methods for dealing with it.
 * 
 * @class ConfluencePage
 * @param {ConfluenceClient} refConfluenceClient Reference to an {@link ConfluenceClient} object.
 * @param {Object} jsonPage Response of a REST API call.
 * @throws {Error} If parameter `refConfluenceClient` does not points to a valid object of type {@link ConfluenceClient}
 * @throws {Error} If parameter `jsonPage` does not represent a valid JSON object.
 */
ConfluencePage.prototype = {
	initialize: function(refConfluenceClient, jsonPage) {
		if (!(refConfluenceClient && refConfluenceClient instanceof ConfluenceClient)) {
			throw new Error(
				"[ConfluencePage.initialize] Please pass a reference to a valid {ConfluenceClient} object at parameter {refConfluenceClient}!"
			);

		}
		if (!(typeof jsonPage === "object")) {
			throw new Error(
				"[ConfluencePage.initialize] Please pass a valid JSON object at parameter {jsonPage}!"
			);

		}

		this._refConfluenceClient       = refConfluenceClient;
		this._strInternalId             = refConfluenceClient._strInternalId.toString();
		this._intId                     = jsonPage.id;
		this._strStatus                 = jsonPage.status;
		this._strTitle                  = jsonPage.title;
		this._hasTitleChanged           = false;
		this._strSpaceKey               = jsonPage.space.key;
		this._hasSpaceKeyChanged        = false;
		this._intVersionNumber          = jsonPage.version.number;
		this._strBody                   = jsonPage.body.storage.value;
		this._hasBodyChanged            = false;
		this._renderedHTML              = jsonPage.body.styled_view.value;
		this._arrLabels                 = jsonPage.metadata.labels.results;
		this._haveLabelsChanged         = false;
		this._userReadingRestrictions   = jsonPage.restrictions.read.restrictions.user.results;
		this._groupReadingRestrictions  = jsonPage.restrictions.read.restrictions.group.results;
		this._userUpdatingRestrictions  = jsonPage.restrictions.update.restrictions.user.results;
		this._groupUpdatingRestrictions = jsonPage.restrictions.update.restrictions.group.results;

		if (jsonPage.history.lastUpdated.by) {
			this._strModifierUserName    = jsonPage.history.lastUpdated.by.username;
			this._strModifierDisplayName = jsonPage.history.lastUpdated.by.displayName;
		}

		if (jsonPage.history.lastUpdated.when) {
			var gdtModification = new GlideDateTime();

			gdtModification.setDisplayValue(jsonPage.history.lastUpdated.when, "yyyy-MM-dd'T'HH:mm:ss");
			
			this._gdtModification = gdtModification;
		}

		if (Array.isArray(jsonPage.ancestors) && jsonPage.ancestors.length > 0) {
			this.setParentPageId(jsonPage.ancestors[jsonPage.ancestors.length - 1].id);

			this._hasParentPageIdChanged = false;
			this._arrAncestors           = [];

			for (var i = 0; i < jsonPage.ancestors.length; i++) {
				this._arrAncestors.push(
					new ConfluencePage(refConfluenceClient, jsonPage.ancestors[i])
				);
			}
		}
	},

	/**
	 * Getter for the Confluence page status.
	 * 
	 * @returns {String} Status of the Confluence page if available or `undefined` if not.
	 */
	getStatus: function() {
		return this._strStatus;
	},

	/**
	 * Setter for the Confluence page status.
	 * 
	 * @param {String} strStatus Status of the Confluence page. Only allowed values are `current` and `trashed`.
	 * @throws {Error} If value at parameter `strStatus`is not a String or different from the allowed values.
	 */
	setStatus: function(strStatus) {
		if (!(typeof strStatus === "string" && (strStatus === 'current' || strStatus === 'trashed'))) {
			throw new Error(
				"[ConfluencePage.setStatus] Please pass a valid page status at parameter {strStatus}!"
			);					
		}

		this._strStatus = strStatus;
	},

	/**
	 * Getter for the Confluence page ID.
	 * 
	 * @returns {Integer} ID of the Confluence page if available or `undefined` if not.
	 */
	getId: function() {
		return this._intId;
	},
	
	/**
	 * Setter for the Confluence page ID.
	 * 
	 * @param {Integer} intId A valid Confluence page ID.
	 * @throws {Error} If passed `intId` is not a valid Confluence page ID.
 	 * @throws {Error} If once set page ID should be changed.
	 */
	setId: function(intId) {
		if (!ConfluenceClient.isValidInteger(intId)) {
			throw new Error(
				"[ConfluencePage.setId] Please pass a valid Confluence page ID at parameter {intId}!"
			);					
		}

		if (this._intId && this._intId != intId) {
			throw new Error("[ConfluencePage.setId] It is not allowed to change the page ID!");
		}

		this._intId = intId;
	},

	/**
	 * Getter for the Confluence page title.
	 * 
	 * @returns {String} Title of the Confluence page if available or `undefined` if not.
	 */
	getTitle: function() {
		return this._strTitle; 
	},

	/**
	 * Setter for the Confluence page title.
	 * 
	 * @param {String} strTitle  The new title of the Confluence page.
	 * @throws {Error} If `strTitle` is empty or not of type `String`.
	 */
	setTitle: function(strTitle) {				
		if (!(typeof strTitle === "string" && strTitle.length > 0)) {
			throw new Error(
				"[ConfluencePage.setTitle] Please pass a valid page title at parameter {strTitle}!"
			);					
		}
		
		this._hasTitleChanged = this._strTitle !== strTitle;
		this._strTitle        = strTitle;
	},
	
	/**
	 * Getter for the space key the Confluence page is located in.
	 * 
	 * @returns {String} Space key or `undefined` if no space key is stored.
	 */
	getSpaceKey: function() {
		return this._strSpaceKey;
	},
	
	/**
	 * Setter for the (new) space key the Confluence page should be located in.
	 * 
	 * @param {String} strSpaceKey Key of the (new) space.
	 * @throws {Error} If `strSpaceKey` is not a valid Confluence space key.
	 */
	setSpaceKey: function(strSpaceKey) {
		if (!ConfluenceClient.isValidSpaceKey(strSpaceKey)) {
			throw new Error(
				"[ConfluencePage.setSpaceKey] Please pass a valid space key at parameter {strSpaceKey}!"
			);					
		}

		this._hasSpaceKeyChanged = this._strSpaceKey !== strSpaceKey;
		this._strSpaceKey        = strSpaceKey;
	},
	
	/**
	 * Getter for the version number of the Confluence page.
	 * 
	 * @returns {Integer} Version number if defined or `undefined` if not
	 */
	getVersionNumber: function() {
		return this._intVersionNumber;
	},

	/**
	 * Setter for the version number of a Confluence page.
	 * 
	 * @param {Integer} intVersionNumber Version number of the current page version.
	 * @throws {Error} If passed `intVersionNumber` is not a valid `Integer` value.
	 */
	setVersionNumber: function(intVersionNumber) {
		if (!ConfluenceClient.isValidInteger(intVersionNumber)) {
			throw new Error(
				"[ConfluencePage.setVersionNumber] Please pass a valid integer value at parameter {intVersionNumber}!"
			);					
		}

		if (this._intVersionNumber !== intVersionNumber) {
			this._hasTitleChanged        = false;
			this._hasSpaceKeyChanged     = false;
			this._hasParentPageIdChanged = false;
			this._hasBodyChanged         = false;
			this._haveLabelsChanged      = false;
		}

		this._intVersionNumber = intVersionNumber;
	},

	/**
	 * Increases the page version by adding +1.
	 */
	increaseVersionNumber: function() {
		if (!this._intVersionNumber) {
			throw new Error(
				"[ConfluencePage.increaseVersionNumber] Page object has not been initialized!"
			);					
		}

		this._intVersionNumber += 1;
	},

	/**
	 * Setter for the content of a Confluence page.
	 * 
	 * @param {String} strBody Page content as storage format.
	 * @throws {Error} If passed `strBody` is not of type `String`.
	 */
	setBody: function(strBody) {
		if (!(typeof strBody === "string")) {
			throw new Error(
				"[ConfluencePage.setBody] Please pass a valid body content at parameter {strBody}!"
			);					
		}

		this._hasBodyChanged = this._strBody !== strBody;
		this._strBody        = strBody;
	},
	
	/**
	 * Getter for the content of a Confluence page.
	 * 
	 * @returns {String} Page content as storage format if defined or `undefined` if not.
	 */
	getBody: function() {
		return this._strBody;
	},

	/**
	 * Getter for HTML of the rendered Confluence Page.
	 * 
	 * @returns {String} Rendered HTML of that Confluence page if defined or `undefined`if not. 
	 */
	getRenderedHTML: function() {
		return this._renderedHTML;
	},

	/**
	 * Loads the Scaffolding data by invoking {@link ConfluenceClient#loadScaffoldingData}.
	 * 
	 * @param {Array<String>} [strAllowedFields] Optional list of field names that should remain at result array.
	 * @returns {Boolean} `true` if loading of Scaffolding data was successful otherwise `false`.
	 * @throws {Error} If page object has no page ID stored.
	 */
	loadScaffoldingData: function(strAllowedFields) {
		if (!this.getId()) {
			throw new Error(
				"[ConfluencePage.loadScaffoldingData] Please set a valid page ID with method 'setId()'!"
			);					
		}

		var arrScaffoldingData = this._refConfluenceClient.loadScaffoldingData(this.getId(), strAllowedFields);

		if (arrScaffoldingData != null) {
			this.setScaffoldingData(arrScaffoldingData);

			return true;
		}

		return false;
	},
	
	/**
	 * Getter for the Scaffolding data.
	 * 
	 * @returns {Array<Object>} Array with all Scaffolding data if defined or `undefined`if not.
	 */
	getScaffoldingData: function() {
		return this._scaffoldingData;
	},
	
	/**
	 * Setter for the Scaffolding data.
	 * 
	 * @param {Array} arrScaffoldingData Array with the scaffolding data
	 * @throws {Error} If passed `arrScaffoldingData` is not of type `Array`.
	 */
	setScaffoldingData: function(arrScaffoldingData) {
		if (!Array.isArray(arrScaffoldingData)) {
			throw new Error(
				"[ConfluencePage.setScaffoldingData] Please pass a valid array at parameter {arrScaffoldingData}!"
			);					
		}

		this._scaffoldingData = arrScaffoldingData;
	},
	
	/**
	 * Getter for a single scaffolding field value.
	 * 
	 * @param {String} strFieldName Name of the scaffolding field whoose value should be returned.
	 * @returns {Object} Value of requested scaffolding field if defined or `undefined` if not.
	 * @throws {Error} If passed `strFieldName` is not a valid `String` value.
	 */
	getScaffoldingValue: function(strFieldName) {
		if (!(typeof strFieldName === "string" && strFieldName.length > 0)) {
			throw new Error(
				"[ConfluencePage.getScaffoldingValue] Please pass a valid field name id at parameter {strFieldName}!"
			);					
		}
		
		if (this._scaffoldingData) {
			for (var i = 0; i < this._scaffoldingData.length; i++) { 
				if (this._scaffoldingData[i].name === strFieldName) {
					return this._scaffoldingData[i].value;
				}					
			}
		}

		return undefined;
	},
	
	/**
	 * Setter for a single scaffolding field value.
	 * 
	 * @param {String} strFieldName Name of the scaffolding field whoose value should be set.
	 * @param {*} objFieldValue New value for the specified scaffolding field.
	 * @throws {Error} If passed `strFieldName` is not a valid `String` value.
	 */
	setScaffoldingValue: function(strFieldName, objFieldValue) {		
		if (!(typeof strFieldName === "string" && strFieldName.length > 0)) {
			throw new Error(
				"[ConfluencePage.setScaffoldingValue] Please pass a valid field name at parameter {strFieldName}!"
			);					
		}
	
		if (this._scaffoldingData) {
			//try to find the field by its name
			for (var i = 0; i < this._scaffoldingData.length; i++) {
				if (this._scaffoldingData[i].name == strFieldName) {
					this._scaffoldingData[i].value = objFieldValue || "";

					return;
				}
			}
		}
		else {
			this._scaffoldingData = [];
		}

		//no proper field found, add a new one 
		this._scaffoldingData.push({name: strFieldName, value: objFieldValue || ""});
	},
	
	/**
	 * Getter for the list of ancestors.
	 * 
	 * @returns {Array<ConfluencePage>} List of ancestors - wrapped by {@link ConfluencePage} objects - if defined or `undefined` if not.
	 */
	getAncestors: function() {
		return this._arrAncestors;
	},

	/**
	 * Setter for the parent page ID.
	 * 
	 * @param {Integer} intParentPageId Id of the new parent page.
	 * @throws {Error} If passed `intParentPageId` is not a valid `Integer` value.
	 */
	setParentPageId: function(intParentPageId) {
		if (!ConfluenceClient.isValidInteger(intParentPageId)) {
			throw new Error(
				"[ConfluencePage.setParentPageId] Please pass a valid page ID at parameter {intParentPageId}!"
			);					
		}

		this._hasParentPageIdChanged = this._intParentPageId !== intParentPageId;
		this._intParentPageId        = intParentPageId;
	},
	
	/**
	 * Getter for the parent page ID.
	 * 
	 * @returns {Integer} Id of the parent page if defined or `undefined` if not.
	 */
	getParentPageId: function() {
		return this._intParentPageId;
	},

	/**
	 * Getter for the modification date and time of a Confluence page.
	 * 
	 * @returns {GlideDateTime} An instance of a [GlideDateTime]{@link https://developer.servicenow.com/dev.do#!/reference/api/orlando/server/c_APIRef} object if defined or `undefined`if not.
	 */
	getModificationDateTime: function() {
		return this._gdtModification;
	},
	
	/**
	 * Getter for the user name of the last modifier of a Confluence page.
	 * 
	 * @returns {String} User name of the last modifier if available or `undefined`if not.
	 */
	getModifierUserName: function() {
		return this._strModifierUserName;
	},
	
	/**
	 * Getter for the display name of the last modifier of a Confluence page.
	 * 
	 * @returns {String} Full name of the last modifier if available or `undefined`if not.
	 */
	getModifierDisplayName: function() {
		return this._strModifierDisplayName;
	},
	
	/**
	 * Getter for the list of page labels.
	 * 
	 * @returns {Array<Object>} List of page labels if defined or `undefined` if not.
	 */
	getLabels: function() {
		return this._arrLabels;
	},

	/**
	 * Tests whether this {@link ConfluencePage} object has a label named by given `strName`.
	 * 
	 * @param {String} strName Label name to test.
	 * @returns {Boolean} `True` if label with given name exists or `false`if not.
	 * @throws {Error} If passed `strName` does not represent a valid label name.
	 */
	hasLabel: function(strName) {
		if (!ConfluenceClient.isValidLabelName(strName)) {
			throw new Error(
				"[ConfluencePage.hasLabel] Please pass a valid label name at parameter {strName}!"
			);					
		}
		
		if (this._arrLabels) {
			var _strName = strName.toLowerCase();

			//tests whether label name exists
			for (var i = 0; i < this._arrLabels.length; i++) {
				if (this._arrLabels[i].name == _strName) {
					return true;
				}
			}
		}

		return false;
	},
	
	/**
	 * Adds a single label to the internal list of page labels.
	 * 
	 * @param {String} strName label name
	 * @throws {Error} If passed `strName` does not represent a valid label name.
	 */
	addLabel: function(strName) {
		if (!ConfluenceClient.isValidLabelName(strName)) {
			throw new Error(
				"[ConfluencePage.addLabel] Please pass a valid label name at parameter {strName}!"
			);					
		}
		
		var _strName = strName.toLowerCase().trim();
		
		if (this._arrLabels) {
			//tests whether label name already exists
			for (var i = 0; i < this._arrLabels.length; i++) {
				if (this._arrLabels[i].name === _strName) {
					return;
				}
			}
		}
		else {
			this._arrLabels = [];
		}

		this._haveLabelsChanged = true;

		this._arrLabels.push({prefix: "global", name: _strName});
	},

	/**
	 * Removes a label with given name from the internal list of page labels.
	 * 
	 * @param {String} strName Name of the label to be removed.
	 * @throws {Error} If passed `strName` does not represent a valid label name.
	 */
	removeLabel: function(strName) {
		if (!ConfluenceClient.isValidLabelName(strName)) {
			throw new Error(
				"[ConfluencePage.addLabel] Please pass a valid label name at parameter {strName}!"
			);					
		}

		if (this._arrLabels) {
			var _strName      = strName.toLowerCase().trim();
			var _arrTmpLabels = [];

			for (var i = 0; i < this._arrLabels.length; i++) {
				if (this._arrLabels[i].name === _strName) {
					this._haveLabelsChanged = true;
				}
				else {
					_arrTmpLabels.push(this._arrLabels[i]);
				}
			}

			this._arrLabels = _arrTmpLabels;
		}
	},

	/**
	 * Getter for the list of all user based reading restrictions.
	 * 
	 * @returns {Array<Object>} List of objects for all users that are allowed to read this Confluence page.
	 */
	getUserReadingRestrictions: function() {
		return this._userReadingRestrictions;
	},
		
	/**
	 * Getter for the list of all user based updating restrictions.
	 * 
	 * @returns {Array<Object>} List of objects for all users that are allowed to update this Confluence page.
	 */
	getUserUpdatingRestrictions: function() {
		return this._userUpdatingRestrictions;
	},

	/**
	 * Getter for the list of all group based reading restrictions.
	 * 
	 * @returns {Array<Object>} List of objects for all groups that are allowed to read this Confluence page.
	 */
	getGroupReadingRestrictions: function() {
		return this._groupReadingRestrictions;
	},
		
	/**
	 * Getter for the list of all group based updating restrictions.
	 * 
	 * @returns {Array<Object>} List of objects for all groups that are allowed to update this Confluence page.
	 */
	getGroupUpdatingRestrictions: function() {
		return this._groupUpdatingRestrictions;
	},

	/**
	 * Updates page data on the Confluence server by invoking method {@link ConfluenceClient#updatePagedata}.
	 * 
	 * @param {Boolean} [suppressNotifications] If `true` no email notifications will be sent to watchers.
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */
	updatePageData: function(suppressNotifications) {
		if (this._hasBodyChanged || this._hasParentPageIdChanged || this._hasSpaceKeyChanged || this._hasTitleChanged) {
			return this._refConfluenceClient.updatePageData(this, suppressNotifications);
		} 
		else if (this._haveLabelsChanged) {
			this._refConfluenceClient._logDebug(
				"[ConfluencePage.updatePageData] At page with ID = '" + this._intId + "' only labels have changed. " + 
				"Therefore just invoke method 'updatePageLabels()' ..."
			);
			
			return this.updatePageLabels();
		}

		this._refConfluenceClient._logDebug(
			"[ConfluencePage.updatePageData] At page with ID = '" + this._intId + "' nothing has changed. " + 
			"Therefore no update requests will be sent to Confluence server!"
		);

		return false;
	},

	/**
	 * Updates page data on the Confluence server by invoking method {@link ConfluenceClient#updatePageLabels}.
	 * 
	 * @returns {Boolean} `true` if operation was successful otherwise `false`.
	 */
	updatePageLabels: function() {
		return this._refConfluenceClient.updatePageLabels(this);
	},

	/**
	 * Updates page data on the Confluence server by invoking method {@link ConfluenceClient#updateScaffoldingData}.
	 * 
	 * @returns `true` if operation was successful otherwise `false`.
	 */
	updateScaffoldingData: function() {
		return this._refConfluenceClient.updateScaffoldingData(this);
	},

	/**
	 * Creates a new Confluence page by invoking method {@link ConfluenceClient#createPage}.
	 * 
	 * @returns `true` if operation was successful otherwise `false`.
	 */
	create: function() {
		return this._refConfluenceClient.createPage(this);
	},

	/**
	 * Deletes a Confluence page by invoking method {@link ConfluenceClient#removePage}.
	 * 
	 * @returns `true` if operation was successful otherwise `false`.
	 */
	remove: function() {
		return this._refConfluenceClient.removePage(this);
	},

	/**
	 * Returns a JSON based representation of this page object that can be used as payload for REST api requests.
	 * 
	 * @param {Boolean} createNewPage If `true` only fields will be returned that are necessary for creating new pages.
	 * @param {Boolean} [suppressNotifications] If `true` no email notifications will be sent to watchers.
	 * @returns {String} String in JSON format
	 */
	stringify: function(createNewPage, suppressNotifications) {
		var objResult = {};

		if (!(typeof createNewPage === "boolean" && createNewPage == true)) {
			objResult.id      = this.getId();
			objResult.version = {number: this.getVersionNumber() + 1};
		}

		if (typeof suppressNotifications === "boolean" && suppressNotifications == true) {
			objResult.version.minorEdit = true;
		}

		objResult.type  = "page";
		objResult.title = this.getTitle();		
		objResult.space = {key: this.getSpaceKey()};
		
		if (this.getBody()) {
			objResult.body = {storage: {value: this.getBody(), representation: "storage"}};
		}

		if (this.getLabels()) {
			objResult.metadata = {labels: this.getLabels()};
		}

		if (this.getParentPageId()) {
			objResult.ancestors = [{id: this.getParentPageId()}];
		}

		return JSON.stringify(objResult);
	},


	/**
	 * Tests whether this object is a valid initialized {@link ConfluencePage} object.
	 * 
	 * @returns {Boolean} `True` in case this object is a valid {@link ConfluencePage} object.
	 */
	isValid: function() {
		return this._strInternalId == this._refConfluenceClient._strInternalId;
	},
};