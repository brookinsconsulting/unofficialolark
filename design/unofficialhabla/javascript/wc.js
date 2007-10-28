var hbl_hostname="hab.la/rpc";


var hblrpcTrick = 1;
var hblDEBUG = 0;
var hblnoconsole= 1;
var hblHideUnsupported = 1;
/*
	- Added Pipelines, Event manager  (both priorty queues)
	- Pipelines Fn' Rock :-)
	- Now I need to make some sort of automatic google Analytics mod.
	- need to add handlers, for window_opened, window_closed, and window_minimized
	
	Backend changes and TODO

		
		input/ Processors / preprocessors
		output / preprocessor
			
	
	
	- accept random number on all JSON calls [to not cache them]
	- add SendEvent for logging remote events such as Chat Open, Chat Close, Chat Shrink
	- write up nice documentation
	
	- split this thing into multiple files that are collated automatically when it's installed.
	- add support for the the config options I've talked about before.
	- [look over all the config options, to make sure it works with google talk, and the facebook wrapper]
*/

/**
	Ok we are going to refactor with the intention of splitting things into two pieces  the HABLA server part
	and the Viewer Part
**/

// the new namespace

var hbl = {
	/** hbl.client has everything to do with the JSON client for hab.la **/
	client  : null,
	/** The hbl.hwindow namespace stores the Hab.la Window object **/
	hwindow : null,
	/** The hbl.util namespace stores all multipurpose utility functions **/
	util    : null,
	
	/** events :-) **/
	events : {},
	/** pipelines **/
	pipelines : {},
	
	/** plugins /add-ins **/	
	plugins : {},
	
	/** hbl.css has CSS rendering functions **/
	css : null 
}

/** ok flesh out the class **/
var hbl = {
	onoldresize: false,
	onoldscroll: false,
	events : {},
	pipelines : {},
	plugins : {},	
	hwindow : {
		// Can probably get rid of these
		//--------- kevin
		//dimension_hack : false,  hbl.util.BrowserDetect.backwards_dimension
		//position_hack : false, [We can now use hbl.util.BrowserDetect.backwards_position]
		// -----------kevin
		
		panel : function(client, config, divid, eventmgr, not_append){
			if(divid == undefined){
				divid = hbl.hwindow.defaults.divid;
			}
			
			this.eventmgr = eventmgr;
			// probably need to call something to register events
			/*
				status_change
				expand_box_click
				shrink_box_click
				close_box_click
				send_message
				receive_message
				gain_focus
			*/
			
			// Probably the only pipeline we have is a display pipeline
			//this.display_pipeline = new hbl.util.pipeline();
			
			// Create pipelines
			
			/* Pipeline for sending messages*/
			this.send_pipeline = new hbl.util.pipeline(this);
			this.send_pipeline.add(hbl.pipelines.nickname,999);
			
			/* pipeline for displaying messages */
			this.display_pipeline = new hbl.util.pipeline(this);
			this.display_pipeline.add(hbl.pipelines.wrap_text,999);
			this.display_pipeline.add(hbl.pipelines.emoticons,1000);
			
			/* we'll also need a pipeline for handing incoming messages, BEFORE they are appended */
			
			
		
			
			this.register_events(this);
			// probably create a pipeline here
			
			this.visible = false;
			
			this.div = hbl.util.find_or_create_div(divid, (not_append == undefined ? hbl.util.get_body() : null) );

			this.client = client;
			this.config = config;

			this.build_window(this, this.config);
			this.render_window(this,this.config);
			
			this.compress(); // HMMM do I want to make it so it can start expanded.
											 // I think I do.. but you could just add a this.expand() somewhere else in the code 
											 // no problem.
			
			},
		
		
		
		
		config : function() { 
      /* people can create config before BrowserDetect */
	    hbl.util.BrowserDetect.init();
      this.load_config(); 
    },
		defaults : {
			divid : "habla_window"
		},
		util : {}
		
	},
	
	/** I need to remove this function once we change the backend */
	jsoncallback : function(data) {
		hbl.client.jsoncallback(data);
	},
	jsoncallback_norv: function(data) {
		hbl.client.jsoncallback_norv(data);
	},
	
	/** hbl.client has everything to do with the JSON client for hab.la **/
	client  : {
		/* site ID and wc_id */
		siteid: "",
		wc_sid: "",
		sid : "",		
		proxy : null,
		// Temporary timeout variables for now.
		offline_timeout : 15*1000,
		online_timeout  : 5*1000,
    chatting_timeout : 750,
    current_timeout : 5*1000,
		first_timeout : 400,
		
		/** name for local user **/
		myname : "you",
		
		/** general state variables **/
		opstatus    : null,
		opavailable : null,
		opmessage   : null,
		chatting : false,
		buffer: new Array(),
		
		/** variables for calling the JSON stuff **/
		the_count : 0,
	  newlinecount : 0,
	  lastindex : 0,
	  last_getmessages : new Date(),
	
		/*** json code ***/
		jsondata : null,
		jsondataready : false,
		datareadycallback : null,
		getmsgcallback : null,
		
		jsoncallback : function(data) {
	  	hbl.client.jsondata = data;
	  	hbl.client.jsondataready = true;
	  	if( hbl.client.datareadycallback!=null ) {
	    	var tmp = hbl.client.datareadycallback;
	    	hbl.client.datareadycallback = null;
	    	hbl.util.debug(" => returned drcb to null");
	    	tmp(hbl.client.jsondata);
	    	if( hbl.client.proxy.callq.length>0 ) {
	      	var tmp2 = hbl.client.proxy.callq.shift();
	      	hbl.client.proxy.docall( tmp2[0], tmp2[1], tmp2[2] );
	    	}
	  	}
		},

		start : function(site_id, wc_sid, eventmgr, hwindow){
			/* This is going to start the client*/
			hbl.client.siteid = site_id;
			hbl.client.wcsid  = wc_sid;
			hbl.client.eventmgr = eventmgr;
			hbl.client.habla_window = hwindow;
			
			/*
				So.. this raises a question, should the SERVER parse text sent from the client side.
				or should we do it here..
				
				OR should we just do both :-)
				both seems more developer friendly.
			
			*/
			hbl.client.incoming_pipeline = new hbl.util.pipeline(this);
			hbl.client.incoming_pipeline.add(hbl.pipelines.push_url,999);

			try {
				if( hblrpcTrick) {
					// Ok, if we are doing the trick, we'll have two proxies, one will be 'random'
				    hbl.client.proxy = new hbl.client.jsonproxy( "aync." + hbl_hostname);
				    var first_part = parseInt(Math.random() * 1000).toString() + ".event.";
				    hbl.client.proxy2 = new hbl.client.jsonproxy( first_part + hbl_hostname);
				     
				}else {
				    hbl.client.proxy = new hbl.client.jsonproxy( hbl_hostname);
				    hbl.client.proxy2 = hbl.client.proxy;
				}
		    hbl.client.proxy.begin(wc_sid, site_id , document.URL, document.referrer, function(r) {
		      /* check if there is a free slot for us first */
		      if( r!=null ) {
		        hbl.client.sid = r.sid;

						if(r.chatting == "on") {
							hbl.client.newlinecount = 1;
							hbl.client.chatting = true;
						}
						/* now with a callback */
						/* ADD EVENT MANAGER */
						hbl.client.eventmgr.handle("chat_started", { "chatting": (r.chatting=="on") } );

		        if( r.context ) {
							// I might want to pull this out into an EVENT handler
		          hbl.client.setContents( r.context );
		        }
						// you could imagine moving the setCookie somewhere else 
						// to make this more scalable
		        hbl.util.set_cookie( "wcsid", hbl.client.sid );
		
						// let's wait a little bit before getting a session:
						window.setTimeout("hbl.client.get_messages()", hbl.client.first_timeout);
		        
            /* we only need to check for getmessages freezing if we're sleeping.
             * actually, I hate this whole thing. do we need it? */
            if( !hbl.client.habla_window.config.vars["poll"] ) 
  		        setTimeout("hbl.client.check_getmsg()", 1000*60);
		      }
		    });

		  } catch(e){
			
				hbl.client.chatting = false;
		    hbl.util.reportException(e);
		    throw e;
		  }
			
		},
		
		get_messages : function() {
		  var r;
		  try {
        if( hbl.client.habla_window.config.vars["poll"] ) {
  		    hbl.client.proxy.pollmessages(hbl.client.sid, hbl.client.lastindex, function(r){
  		      try {
  						// Ok, I need to fire an OpStatus Change event if the opstatus is different
  						if(r.opavailable != hbl.client.opavailable || hbl.client.opmessage  != r.opmessage || hbl.client.opstatus != r.opstatus) {
  							// change the op status
  							hbl.client.opavailable = r.opavailable;
  							hbl.client.opmessage   = r.opmessage;
  							hbl.client.opstatus    = r.opstatus;
  							
  							/* now with a callback */
  							// fire an event

								hbl.client.eventmgr.handle("operator_status_change", { "available": r.opavailable, "status": r.opstatus, "message": r.opmessage } )
  						}
  						
  		        hbl.client.append1( r.buffer );

  						/* ADD EVENT MANAGER */
              if( r.opavailable ) {
  		          window.setTimeout("hbl.client.get_messages()", hbl.client.current_timeout);
  						}else {
  		          window.setTimeout("hbl.client.get_messages()", hbl.client.offline_timeout);						
  						}
  						/*
  							Also in the future the JSON call could control how long this call is, etc..
  						*/
  						
  						// I need to figure out how to deal with the case where the window is invisible
  						// do we keep chatting, do we make the timeout higher..
  						// what the heck do we do?
  		      } catch(e) {
  		        /* do something here */
  		        throw e;
  		      }
  		    });

        } else {
  		    /* send messages in the queue first, then get incoming messages */
  		    hbl.client.proxy2.getmessages(hbl.client.sid, hbl.client.lastindex, function(r){
  		      try {
  						if(r.opavailable != hbl.client.opavailable || hbl.client.opmessage  != r.opmessage || hbl.client.opstatus != r.opstatus) {
  							// change the op status
  							hbl.client.opavailable = r.opavailable;
  							hbl.client.opmessage   = r.opmessage;
  							hbl.client.opstatus    = r.opstatus;
  							
  							/* now with a callback */
  							// fire an event
								/* ADD EVENT MANAGER */
								hbl.client.eventmgr.handle("operator_status_change", { "available": r.opavailable, "status": r.opstatus, "message": r.opmessage } )
  						}
  						
  		        hbl.client.append1( r.buffer );
  
  						// Hmmm.. I think we need something else to
  						// tell it to run getmessages. 
  						// or.. 
  						
  		        //if( hbl.habla.getVisible() )
  						// Make this a bit longer IF (not online)
  						if(r.opavailable){
  		          window.setTimeout("hbl.client.get_messages()", 0);
  						}else {
  		          window.setTimeout("hbl.client.get_messages()", hbl.client.offline_timeout);						
  						}
  						/*
  							Also in the future the JSON call could control how long this call is, etc..
  						*/
  						
  						// I need to figure out how to deal with the case where the window is invisible
  						// do we keep chatting, do we make the timeout higher..
  						// what the heck do we do?
		        } catch(e) {
  		        /* do something here */
  		        throw e;
  		      }
  		    });
        }
		  } catch(e) {
		    hbl.util.reportException(e);
		    //hbl.wc_hide_window();
		    hbl.client.chatting = false;
		    throw e;
		    throw "getmessage failed";
		  }

		  return false;
		},
				
		
		/** ---------------------------------------------------------------------------------------------------------------------**/
		
		jsoncallback_norv: function(data) {
			// We should probably add some retun value processing
		},

		jsonproxy : function(uri) {
	  	this.uri = uri;
	  	this.callq = new Array();
		},
			
		check_getmsg : function() {
		  var now = new Date();
		  /* timeout is 30 seconds, so 60 secs with no response is fishy. */
		  if( now.getTime() - hbl.client.last_getmessages.getTime() > (1000*60*1) ) {
		    /* no getmsg for five minutes? start it up again. */
		    hbl.client.get_messages();
		  }
		  setTimeout("hbl.client.check_getmsg()", 10*1000);
		},	
		
		/** These are all utility functions that could probably be combined into one function **/
		
	  setContents : function(cont) {
			if( !cont || cont.length == 0) return;
			
	    hbl.client.lastindex = 0;
	    for(i=0;i<cont.length;++i) {
	      hbl.client.buffer[hbl.client.buffer.length] = new Array(cont[i][0], cont[i][1])
	      if( cont[i][2]>hbl.client.lastindex )
	        hbl.client.lastindex = cont[i][2];
	    }
			// I need some sort of call back here
			// like .. look we got more content
			// do something now.
			hbl.client.newlinecount = 1;
			
			/* ADD HANDLER HERE*/
			hbl.client.eventmgr.handle("receive_message", { "type" : "start" } );
	  },
	
		/* this is used to append outgoing message to the chat */
	  append : function(buf) {
	    if( ! (buf.length>0) ) return;
	
	    for(i=0; i < buf.length; ++i) {
				// If I wanted to turn links into links
				// right here would be one place to do it.
	      hbl.client.buffer[hbl.client.buffer.length] =  new Array(buf[i][0], buf[i][1] );
	    }
	    hbl.client.newlinecount += buf.length;
	
			// fire an event noting an update
			hbl.client.eventmgr.handle("send_message", { "type" : "local_update" } );
	  },

		/* this is used when sending a message */
	  append1 : function(buf) {
	    if( ! (buf.length>0) ) return;

	    for(i=0; i < buf.length; ++i) {
				// If I wanted to turn links into links
				// right here would be one place to do it.
				/*
					Preprocess :-)
				*/
				var msg = hbl.client.incoming_pipeline.run(buf[i][1]);
				
				if( msg != undefined ) {	
	      	
					hbl.client.buffer[hbl.client.buffer.length] = new Array(buf[i][0], msg );
	      	hbl.client.lastindex = buf[i][2];
    		}
			}
	    hbl.client.newlinecount += buf.length;
	
			// Fire an update
			// fire an event noting an update
			hbl.client.eventmgr.handle("receive_message", { "type" : "remote_update" } );
	  },

		
		/** end functions that should be combined into one **/

		sendmessage : function(msg) {
			hbl.util.debug("chatclient.send " + msg);
		  var r;
		  try {
		      var tmp = new Array(new Array(hbl.client.myname,msg) );
		      hbl.client.append(tmp);
		      hbl.client.proxy.sendmessage( hbl.client.sid, tmp[0][1] );
		    } catch( e ) {
					hbl.util.debug("EXCEPTION:" + e);
		      throw e;
		    }
		},

    setnickname : function(nick) {
      hbl.util.debug("chatclient.setnickname " + nick);
      var r;
      try {
        hbl.client.proxy.setnickname( hbl.client.sid, nick );
      } catch( e ) {
        hbl.util.debug("EXCEPTION:" + e);
        throw e;
      }
    },
		
		/** Essentially logging functions -- right now -- should just have a SENDEVENT**/
		sendexpand : function() {
			if( ! hbl.client.proxy) return; 
			 hbl.client.proxy.openchat(hbl.client.sid);
		},
		sendhide : function() {
			if( ! hbl.client.proxy) return; 
      hbl.client.proxy.closechat(hbl.client.sid);
		},
		sendcompress : function() {
			if( ! hbl.client.proxy) return; 
			 hbl.client.proxy.closechat(hbl.client.sid);	 
			//hbl.client.proxy.shrinkchat(hbl.client.sid);
		}
		
		/** end the logging stuff **/
			
	},

	/** The hbl.hwindow namespace stores the Hab.la Window object **/
	
	
	/** The hbl.util namespace stores all multipurpose utility functions **/
	util    : {
		eventmanager : function(){
			this.registered_events = {};
			
			// Register a handler
			this.register = function(event_name, handler, priority){
				if(this.registered_events[event_name] == undefined ) {
					this.registered_events[event_name] = new Array();
				}
				if(priority == undefined) {
					priority  = 999;
				}
				
				this.registered_events[event_name].push({"handler" : handler, "priority" : priority });
				this.registered_events[event_name] = this.registered_events[event_name].sort( function(a,b) { return (a["priority"] - b["priority"]); })
			}
			
			// Handler
			this.handle = function(event_name, arg) {
				if(this.registered_events[event_name] == undefined) return;
				
				if(arg == undefined) {
					arg = {};
				}
				arg["window"]     = this.win;
				arg["event_name"] = event_name;
				hbl.util.debug( event_name);
					
				for (var i in this.registered_events[event_name]) {
					if( this.registered_events[event_name][i] && typeof(this.registered_events[event_name][i]["handler"]) == "function") {
						hbl.util.debug("fired event" + this.registered_events[event_name][i]["handler"].toString() );
						this.registered_events[event_name][i]["handler"](arg);
					}
				}
			} // end handle
		
			this.setWindow = function(win) {
				this.win = win;
			}
		}, // end event manager
		
		// pipeline
		// a pipeline is essentially a Queue that processes some content, and
		// moves through the pipeline, as long as the return value from the previous step is not undefined. (otherwise it quits)
		// it is very similar to a event manager.
		
		pipeline : function(hosto){
			this.todo = new Array();
			this.host_obj = hosto;
			
			// Register a handler
			this.add = function(handler, priority){
					if(priority == undefined) {
						priority  = 999;
					}
					this.todo.push({"handler" : handler, "priority" : priority});
					this.todo = this.todo.sort( function(a,b) { return (a["priority"] - b["priority"]); })
			}
			
			// Handler
			this.run = function(arg) {
				var ret = arg;
				for (var i=0;i<this.todo.length;i++) {
					if( this.todo[i] && typeof(this.todo[i]["handler"]) == "function") {
						hbl.util.debug("pipeline" + this.todo[i]["handler"].toString() );
						ret = this.todo[i]["handler"](arg,this.host_obj);
						
						if(ret == undefined) return undefined;
						arg = ret;
					}
				}
				return ret;
			} // end handle
			
			this.setTarget = function(tt) {
				this.host_obj = tt;
			} 
		
		}, // end pipeline
		pluginlist : function(){
			this.todo = new Array();

			
			// Register a handler
			this.add = function(handler, priority){
					if(priority == undefined) {
						priority  = 999;
					}
					this.todo.push({"handler" : handler, "priority" : priority});
					this.todo = this.todo.sort( function(a,b) { return (a["priority"] - b["priority"]); })
			}
			
			// Handler
			this.load = function(arg) {
				var ret = arg;
				for (var i=0;i<this.todo.length;i++) {
					hbl.util.debug("plugin list running");

					if( this.todo[i] && this.todo[i]["handler"] && typeof(this.todo[i]["handler"]["load"]) == "function") {
						hbl.util.debug("pluginlist loaded" + this.todo[i]["handler"].load.toString() );
						this.todo[i]["handler"].load(arg);
					}
				}
				return ret;
			} // end handle		
		},
		/* A helper function to load plugins */
		pluginloader : function(conf, client, hwindow){
			conf.plugins.load({"conf" : conf, "client" : client, "hwindow" : hwindow});
		},
		
		timestamp : function() {
	    var now = new Date();
	    return now.toUTCString();
	  },
		debug : function(x) {
	    if (hblDEBUG == undefined || !hblDEBUG) return;
	
	    //x = timestamp() + " " + x;
	    if( document.getElementById("debug1") ) {
	      d = document.getElementById("debug1");
	      d.innerHTML = x + '<br />' + d.innerHTML;
	    } else if( window.console ) {
	      window.console.log(x);
	    } 
			// opera does not like you trying to check and see if a specific variable exits.
			else if( !hblnoconsole  && console != undefined && console.log ) {
	      console.log(x);
	    } else {
	      alert(x);
	    }
	  },

	  reportException : function(e) {
	  },
	
		set_cookie : function(name, value) {
	  	var d = new Date();
	  	d.setTime( d.getTime() + 24*60*60*1000 );
	  	var expires = d.toGMTString();

	  	value = escape(value);
	  	document.cookie = name + "=" + value + "; expires=" + expires + "; path=/"; 

	  	/*
	  	document.cookie = name + "=" + value + ";"
	  	+ (expires != -1 ? " expires=" + expires + ";" : "")
	  	+ (path ? "path=" + path : "")
	  	+ (domain ? "; domain=" + domain : "")
	  	+ (secure ? "; secure" : "");
	  	*/	
		},

		get_cookie : function(name) {
		  var nameEQ = name + "=";
		  var ca = document.cookie.split(';');
		  for(var i=0;i < ca.length;i++) {
		    var c = ca[i];
		    while (c.charAt(0)==' ') c = c.substring(1,c.length);
		    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
		  }
		  return null;
		},
		load_js_async : function(url){
			
			html_doc = hbl.util.get_body();
			
		  var js = document.createElement('script');
		  js.setAttribute('language', 'javascript');
		  js.setAttribute('type', 'text/javascript');
		  js.setAttribute('src',  url);
		  hbl.util.debug( "docall: hitting " + url );
		  /*if( getmsg || html_doc.childNodes.leng*/
		  html_doc.appendChild(js);
	
		},
		
		get_body : function() {
			var tmp = document.getElementsByTagName("html");
		  var html = null;
		  if( tmp.length<1 ) {
		    html = document.createElement("html");
		    document.appendChild(html);
		  } else {
		    html = tmp[0];
		  }
		  tmp = document.getElementsByTagName('body');
		  var html_doc = null;
		  if( tmp.length > 0 ) {
		    html_doc = document.getElementsByTagName('body').item(0);
		  } else {
		    html_doc = document.createElement('body');
		    html.appendChild(html_doc);
		  }
	
			return html_doc;
		},
	
		/** Get's a DIV or created a new one **/
		find_or_create_div : function (divid, append_to ){
			var ret = document.getElementById(divid);
			if(!ret  || ret.length < 0) {
				
				ret = document.createElement("div");
		  	ret.setAttribute("id",divid);

				if(append_to != undefined) {
					append_to.appendChild(ret);
				}
			}
			return ret;
		},
		
		clean_whitespace : function(val) {
			// I need a regex here as well
			val = val.replace(/^\s*/,"");
			val = val.replace(/\s*$/,"");
			val = val.replace("'","");
			return val;
		},
		
		throttle_length : 200,
		throttle_ts : null,
		/** this is a cool trick I learned at nokia -- it's a good way to stop multiple event handlers from firing at the same time **/
		doThrottle : function() {
		    // timestamp to throttle
		    var ts = (new Date()).getTime();
		    var doThr = false;
		    if (hbl.util.throttle_ts && (ts - hbl.util.throttle_ts) < hbl.util.throttle_length)
		        doThr = true;
		    hbl.util.throttle_ts = ts;
		    return doThr;
		},
		
		/* And now, some cool stuff to do browser detection*/
		// http://www.quirksmode.org/js/detect.html
		// ok it's kind of ugly
		// but I don't feel like rewriting it
		BrowserDetect : {
      _initialized : false,
			init: function() {
        if( this._initialized ) return;
				//this.supported = false;
				this.browser = this.searchString(this.dataBrowser,1) || "An unknown browser";
				this.version = this.searchVersion(navigator.userAgent)
					|| this.searchVersion(navigator.appVersion)
					|| "an unknown version";
				this.OS = this.searchString(this.dataOS) || "an unknown OS";
				
				this.backwards_position  = false;
				this.backwards_dimension = false;
				
				
				if( document.compatMode=="BackCompat"){
					this.backwards_dimension  = true;
				}
        hbl.util.debug(document.compatMode + " " + this.backwards_dimension);
				
				// Do the backcompat stuff here I guess.
				// kevin's stuff
				if(this.browser == "Explorer") {
					this.backwards_position  = true;
					if( (this.version >= 7 || typeof document.body.style.maxHeight != "undefined") && document.compatMode!="BackCompat" ) {
		          /* it's IE7 in CSS1Compat */
		          hbl.util.debug("IE7 compat mode");
		          this.backwards_position  = false;
		       }
				}
				// end back compat stuff

        this._initialized = true;
				
			},
			searchString: function (data, browser) {
				for (var i=0;i<data.length;i++)	{
					var dataString = data[i].string;
					var dataProp = data[i].prop;
					this.versionSearchString = data[i].versionSearch || data[i].identity;
					if (dataString) {
						if (dataString.indexOf(data[i].subString) != -1) {
							if(browser != undefined ) this.supported = data[i].supported;
							return data[i].identity;
						}
					}
					else if (dataProp){
						if(data[i].identity) this.supported = data[i].supported;
						return data[i].identity;
					}
				}
			},
			searchVersion: function (dataString) {
				var index = dataString.indexOf(this.versionSearchString);
				if (index == -1) return;
				return parseFloat(dataString.substring(index+this.versionSearchString.length+1));
			},
			dataBrowser: [
				{ 	string: navigator.userAgent,
					subString: "OmniWeb",
					versionSearch: "OmniWeb/",
					identity: "OmniWeb"
				},
				{
					string: navigator.vendor,
					subString: "Apple",
					identity: "Safari",
					supported: "1"
				},
				{
					prop: window.opera,
					identity: "Opera",
          supported: "1"
				},
				{
					string: navigator.vendor,
					subString: "iCab",
					identity: "iCab"
				},
				{
					string: navigator.vendor,
					subString: "KDE",
					identity: "Konqueror"
				},
				{
					string: navigator.userAgent,
					subString: "Firefox",
					identity: "Firefox",
					supported: "1"
				},
				{
					string: navigator.vendor,
					subString: "Camino",
					identity: "Camino",
					supported: "1"
				},
				{		// for newer Netscapes (6+)
					string: navigator.userAgent,
					subString: "Netscape",
					identity: "Netscape",
					supported: "1"
				},
				{
					string: navigator.userAgent,
					subString: "MSIE",
					identity: "Explorer",
					versionSearch: "MSIE",
					supported: "1"
				},
				{
					string: navigator.userAgent,
					subString: "Gecko",
					identity: "Mozilla",
					versionSearch: "rv",
					supported: "1"
				},
				{ 		// for older Netscapes (4-)
					string: navigator.userAgent,
					subString: "Mozilla",
					identity: "Netscape",
					versionSearch: "Mozilla",
					supported: "1"
				}
			],
			dataOS : [
				{
					string: navigator.platform,
					subString: "Win",
					identity: "Windows"
				},
				{
					string: navigator.platform,
					subString: "Mac",
					identity: "Mac"
				},
				{
					string: navigator.platform,
					subString: "Linux",
					identity: "Linux"
				}
			]

		}// end browserdetect
		
				
		
		
		
	},// end util
	/** a namespace for my CSS functions **/
	css : {
		/** rendering CSS with javascript utility functions **/
		set_css : function(obj, css) {
			// takes an object and a css fragment, attempts to parse it and render it as best as possible.
			var parts = css.split(";")
			for(var i=0;i<parts.length;i++) {
				namval = parts[i].split(":");
				try {
					if(namval.length == 2) {
						name = hbl.css.map_css_to_js(namval[0])
						if(name.indexOf("|") > 0) {
								names = name.split("|");

								for(var j=0;j<names.length;j++) {

									eval("obj.style." + names[j] + "= " + "'" + hbl.util.clean_whitespace(namval[1]) + "'");
								}
						}else {
							eval("obj.style." + name + "= " + "'" + hbl.util.clean_whitespace(namval[1]) + "'");
						}
					}
				}catch (e) {
					hbl.util.debug("obj.style." + hbl.css.map_css_to_js(namval[0]) + "= " + "'" + hbl.util.clean_whitespace(namval[1]) + "'");
					hbl.util.debug("error css Rendering:" + e.message);
				}
			}
		},
		/** a map of relations between css and js **/
		css_to_js : {
			"float" : "cssFloat|styleFloat"
		},
		
		map_css_to_js : function(name) {
			// I need to learn how to do regex
			name = hbl.util.clean_whitespace(name);
			//hbl.util.debug(hbl.css.css_to_js);
			//hbl.util.debug("map to CSS");
			
			// something to map the name to the correct element
			if( hbl.css.css_to_js[name] && hbl.css.css_to_js[name].length > 0)
				return hbl.css.css_to_js[name];

			// A heuristic conversion might be to split by - and then make the next letter capitalized
			var parts = name.split("-");
			name = "";
			for(var i=0;i<parts.length;i++){
				tn= parts[i].toLowerCase();
				if(i > 0)
					tn = tn.substr(0,1).toUpperCase() + tn.slice(1);
				name += tn;
			}

			return name;
		}
	
		
	} // end css
	
} // end hbl


  





/* fn: RPC function to call
 * args: array of arguments to pass in
 * cb: function to call with return value upon completion */

hbl.client.jsonproxy.prototype.docall = function(fn, args, cb, rv) {
	
  if( rv ) {
    if( hbl.client.datareadycallback!=null ) {
      this.callq[this.callq.length] = new Array(fn, args, cb);
      return;
    }
    hbl.client.jsondata = null;
  } else {
    if( hbl.client.getmsgcallback!=null ) {
      return;
    }
  }
  oururi = this.uri + "/" + fn + "?"; 
  for( i=0; i < args.length; ++i ) {
    if( i>0 ) oururi += "&";
    oururi += args[i].replace(/&/g, "%26");
  }
  /* the rpc server returns data as a javascript function call */
  /* so to execute the call, we just include the URI as javascript! */
  /* neat, huh? */
  if( rv ) {
    hbl.client.jsondataready = false;
    hbl.client.datareadycallback = cb;
  } 
	// Util function to load a remote URI
  hbl.util.load_js_async("http://" + oururi);

  /* we don't have to do an onload event; we are already running a callback */
  return null;
}
// We need to add more random number to all the args so we can send more messages, etc.

/* gotta be a better way to do this?  (We need to incorporate REF which is the page their referring URL)*/  
hbl.client.jsonproxy.prototype.begin = function(sid, siteid, page, ref,  cb) {
  return this.docall("begin", new Array(sid, siteid, page), cb, true);
}

hbl.client.jsonproxy.prototype.sendmessage = function(sid, msg, cb) {
	var rnd = Math.random().toString();
  return this.docall("sendmessage", new Array(sid, msg, rnd), cb);
}

hbl.client.jsonproxy.prototype.setnickname = function(sid, nick, cb) {
  return this.docall("setnickname", new Array(sid, nick), cb);
}

hbl.client.jsonproxy.prototype.getmessages = function(sid, idx, cb) {
  hbl.client.the_count++;
  hbl.client.last_getmessages = new Date();
  return this.docall("getmessages", new Array(sid, idx.toString(), (hbl.client.the_count + Math.random()).toString()), cb, true);
}

hbl.client.jsonproxy.prototype.pollmessages = function(sid, idx, cb) {
  hbl.client.the_count++;
  return this.docall("pollmessages", new Array(sid, idx.toString(), (hbl.client.the_count + Math.random()).toString()), cb, true);
}

hbl.client.jsonproxy.prototype.openchat = function(sid, cb) {
  return this.docall("openchat", new Array(sid, Math.random().toString()), cb);
}

hbl.client.jsonproxy.prototype.closechat = function(sid, cb) {
  return this.docall("closechat", new Array(sid, Math.random().toString()), cb);
}

/** End JSON Proxy portion of the client**/


/** 
it would be nice to support multiple types of hwindow 's -- you could imagine loading another hwindow loader
via javascript
**/

/* need to add a bunch of event handlers here */

hbl.hwindow.panel.prototype.build_window = function(obj, config) {
		/* Hide it while we do work */
		obj.div.style.display = 'none';
		
		/* ok it's hidden -- build it all up */
		obj.topbar = hbl.util.find_or_create_div("habla_topbar", obj.div);
		
		/* operator status link */
		obj.oplink = document.createElement("a");
	  obj.oplink.setAttribute("href","#");
	
		
		/* what do I do if there is no min or max button ? */
		if(config.vars["enable_buttons"]) {
		  obj.topbar.onclick = obj.topBarClicked;
			obj.oplink.onclick = obj.topBarClicked;
			
			obj.closebutt = document.createElement("a");
		  obj.closebutt.setAttribute("class","habla_button");
		  obj.closebutt.setAttribute("href","#");
		  //obj.closebutt.onclick = obj.closeClicked;
		  obj.closebutt.onmouseover = function() { this.style.background = config.palette['buttonhi']; }
		  obj.closebutt.onmouseout = function() { this.style.background  = config.palette['buttonbg']; }
		  obj.closebutt.onclick    = function(e) { this.style.background  = config.palette['buttonbg']; obj.closeClicked(e); return false;}
		  obj.closebutt.innerHTML = 'x';

		  obj.topbar.appendChild(this.closebutt);
		
			obj.minbutt = document.createElement("a");
		  obj.minbutt.setAttribute("class","habla_button");
		  obj.minbutt.setAttribute("href","#");
		  //obj.minbutt.onclick = obj.topBarClicked;
		  obj.minbutt.onmouseover = function() { this.style.background = config.palette['buttonhi']; }
		  obj.minbutt.onmouseout = function() { this.style.background = config.palette['buttonbg']; }
			obj.minbutt.onclick    = function(e) { this.style.background = config.palette['buttonbg'];obj.topBarClicked(e); return false;  }
		
		  obj.minbutt.innerHTML = '_';

		  obj.topbar.appendChild(this.minbutt);
	  }else {
			obj.oplink.onclick = function() { return false;}
		}
	
		// We need to drop this out into a function 
		obj.setHeader(config.vars["check_for_status"]);
		obj.topbar.appendChild(obj.oplink);
		
		obj.middle = hbl.util.find_or_create_div("habla_middle", obj.div);
		obj.middle.innerHTML = "";// just in case it got filled in
		//obj.away_message = hbl.util.find_or_create_div("habla_away_message", obj.middle);
		
		obj.convo = hbl.util.find_or_create_div("habla_convo", obj.middle);
		obj.convo.onclick    = obj.onWindowClick;
		
		/** The chat form **/
		obj.chatform = document.createElement("form");
	  

	  obj.chatform.setAttribute("action","#");
	  obj.chatform.setAttribute("method","GET");
	  obj.chatform.setAttribute("autocomplete","off");
		obj.chatform.onfocus    = obj.onWindowFocus;
		
	  obj.input = document.createElement("div");
	  obj.input.setAttribute("id","habla_input");
		
		obj.wcsend = document.createElement("input");
		obj.wcsend.setAttribute("id","habla_wcsend");
		obj.wcsend.setAttribute("size",config.vars["input_box_size"] );
		
		// add this function
		// I'll need to fool around with the event handlers to make it all make sense
		// probably I'll need to define them somewhere in the namespace.. or maybe.. 
		// they could be attached to something passed to this function?
		
		obj.wcsend.onkeypress = obj.onWindowSubmit;
		
		//function() { return hbl.hwindow.submit_on_enter(event) };
		obj.wcsend.onfocus    = obj.onWindowFocus;
		obj.wcsend.onclick    = obj.onWindowFocus;
		obj.wcsend.onmouseover    = obj.onWindowFocus;
		
		obj.say_text = document.createElement("span");
		obj.say_text.setAttribute("id","habla_say_text");
		obj.say_text.innerHTML = config.vars["say_text"];
		
		obj.input.appendChild(obj.say_text);
		obj.input.appendChild(obj.wcsend);
		
		obj.chatform.appendChild(obj.input);
	  obj.middle.appendChild(obj.chatform);

		/* finally the bottom */
		obj.link = document.createElement("div");
	  obj.link.setAttribute("id","habla_link");
	  obj.link.innerHTML = 'Free chat by <a href="http://hab.la" target="_blank">Hab.la</a> | <a href="http://hab.la/survey/show/1" target="_blank">Feedback</a>';
	  obj.div.appendChild(obj.link);
	
	} // end build function

hbl.hwindow.panel.prototype.render_window = function( obj ,config) {
	config.render_js_style(obj.div, "habla_main");
	config.render_js_style(obj.minbutt, "habla_minbutt");
	config.render_js_style(obj.closebutt, "habla_closebutt");
	config.render_js_style(obj.oplink, "habla_oplink");
	config.render_js_style(obj.topbar, "habla_topbar");
	config.render_js_style(obj.convo, "habla_convo");
	//config.render_js_style(obj.away_message, "habla_away_message");
	config.render_js_style(obj.chatform, "habla_form");
  config.render_js_style(obj.input, "habla_input");
}

hbl.hwindow.panel.prototype.register_events = function( obj ) {
	/*
		We'll have a bunch of "default events.. I am not sure where to register them"
	*/
	obj.eventmgr.register("window_focus", hbl.events.onWindowFocus ,0 );
	obj.eventmgr.register("window_click", hbl.events.onWindowFocus ,0 );
	obj.eventmgr.register("window_topbar_close_clicked", hbl.events.closeClicked ,0 );
	obj.eventmgr.register("window_topbar_clicked", hbl.events.topBarClicked ,0 );
	obj.eventmgr.register("window_submit", hbl.events.onWindowSubmit ,0 );

	obj.eventmgr.register("operator_status_change",hbl.events.onOpstatusStatusChanged ,0 );
	obj.eventmgr.register("receive_message", hbl.events.onChatUpdated ,0 );
	obj.eventmgr.register("send_message", hbl.events.onChatUpdated ,0 );
	obj.eventmgr.register("chat_started", hbl.events.onChatStarted ,0 );
	
}


/** -------------------------------------------------------------------------------------------------------------------- **/

hbl.hwindow.panel.prototype.show = function() {
	this.div.style.display = "block";
	// A test for safari.. 
	this.convo.scrollTop = this.convo.scrollHeight;
	this.visible = true;
	// You'd want to add a SEND SHOW here
}

hbl.hwindow.panel.prototype.hide = function() {
	this.div.style.display = "none";
	this.visible = false;
  hbl.client.sendhide();
}

hbl.hwindow.panel.prototype.compress = function() {
	this.middle.style.display = "none";
	this.link.style.display = "none";
	if( this.minbutt) this.minbutt.innerHTML = '^';
	this.expanded = false;


	
	// OK if the browser sucks do this:
	if( hbl.util.BrowserDetect.backwards_position && this.visible) {
		// force a resize
		this.config.ie_position_fix(window.event, this);
	}
  hbl.client.sendcompress();
}

hbl.hwindow.panel.prototype.expand = function() {
	this.middle.style.display = "block";
	this.link.style.display = "block";
  if(this.minbutt) this.minbutt.innerHTML = '_';
	this.expanded = true;
	// Safari seems to screw this up occassionally
	// so we'll add this to make it scroll
	this.convo.scrollTop = this.convo.scrollHeight;
  hbl.client.sendexpand();
}


/** Status related **/
hbl.hwindow.panel.prototype.setAvailable = function(available) {
	this.available = available;
}

hbl.hwindow.panel.prototype.getAvailable = function() {
	return this.available;
}

hbl.hwindow.panel.prototype.setMessage = function(message) {
	this.message = message;
}

hbl.hwindow.panel.prototype.getMessage = function() {
	return this.message;
}

hbl.hwindow.panel.prototype.setStatus = function(status) {
	this.status = status;
}

hbl.hwindow.panel.prototype.getStatus = function(status) {
	return this.status;
}
/** end status related **/

hbl.hwindow.panel.prototype.setHeader = function(msg) {
	this.oplink.innerHTML = msg;
}

hbl.hwindow.panel.prototype.getHeader = function() {
	return this.oplink.innerHTML;
}

hbl.hwindow.panel.prototype.loadBuffer = function (buffer, myname) {
	this.setConvo(hbl.hwindow.util.bufferToHTML(buffer, hbl.client.myname, this.config.vars["local_name_override"]));
} 
hbl.hwindow.panel.prototype.reloadBuffer = function() {
	this.setConvo(hbl.hwindow.util.bufferToHTML(hbl.client.buffer, hbl.client.myname, this.config.vars["local_name_override"]));
	
}


hbl.hwindow.panel.prototype.setConvo = function(msg) {
	this.convo.innerHTML = msg;
	this.convo.scrollTop = this.convo.scrollHeight;
}


hbl.hwindow.panel.prototype.setAwayMessage = function(msg, invisible) {
	this.away_message.innerHTML = msg;
	if(invisible) {
		this.away_message.style.display = "none";
	}else {
		this.away_message.style.display = "block";
	}
	this.convo.scrollTop = this.convo.scrollHeight;
}


hbl.hwindow.panel.prototype.getHeader = function() {
	return this.oplink.innerHTML;
}




hbl.hwindow.panel.prototype.highlight = function() {
	if (this.highlighted) return;
	
  /* ok, highlight the window now*/    
  this.config.render_js_style(this.topbar, "habla_topbar_highlight");
  this.config.render_js_style(this.wcsend, "habla_input_input_highlight");
  this.highlighted = true;

}
hbl.hwindow.panel.prototype.normal   = function() {
  /* turn the window normal */
  if(!this.highlighted) return; 
  
	this.config.render_js_style(this.topbar, "habla_topbar");
  this.config.render_js_style(this.wcsend, "habla_input_input");
  this.highlighted = false;
}

/** -------------------------------------------------------------------------------------------------------------------- **/

/* add newlines to break up any strings that are too wide for the window
str - string to break up
limit - maximum line width
*/

hbl.hwindow.util.wrap = function(str,limit, ignore_url) {
  var first = true;
  var words = str.split(/\s/);
  var rv = '';
  var cur = '';
  var j = 0;
  for(j=0;j<words.length;++j) {
    if( first ) {
      first = false;
    } else {
      rv += ' ';
    }
		cur = words[j];
		
		if(!ignore_url || (ignore_url && !cur.match(/^(https?|ftp|telnet|ldap|irc|nntp|news|irc)/) ) ) {
    	while( cur.length > limit ) {
	      rv += cur.substr(0,limit-1) + ' ';
	      cur = cur.substring(limit-1);
    	}
		}
    rv += cur;
  }
  return rv;
}

/*
	Really I should add some sort of "PreDisplay Handler", and have this link + wordwrap be an option for it
	'I guess the link handler is going to be even more complicated :-)'
*/
hbl.hwindow.util.wrap_and_create_links = function(line) {
		line = hbl.hwindow.util.wrap(line,21,1);
		var re = /\b(?:((?:https?|ftp|telnet|ldap|irc|nntp|news|irc):\/\/[^\s'"<>()]*|[-\w]+@(?:[-\w]+\.)+[\w]{2,6})\b|([\w\-])+(\.([\w\-])+)*@((([a-zA-Z0-9])+(([\-])+([a-zA-Z0-9])+)*\.)+([a-zA-Z])+(([\-])+([a-zA-Z0-9])+)*)|about:[A-Z0-9._?=%-]{4,19}|[A-Z0-9\_-]*[\.]{0,1}[A-Z0-9\_-]*[\.]{0,1}[A-Z0-9\_-]+\.[A-Z]{2,4})\b/gi;
		line=line.replace(re,function($1) { 
													  var url = $1;
														var preurl = url;
														
														
														// I need to see if it's a localURL
														// or if we should wrap it in a Hab.la frame.
														url = hbl.hwindow.util.get_habla_url(url);
														
														return "<a href=\"" + url +"\" target=\"_top\" >" + hbl.hwindow.util.wrap(preurl,21) + "</a>"; 
														});
		hbl.util.debug(line);
		
		return line;
	}

hbl.hwindow.util.get_habla_url = function(url) {
	/* I hate these habla_window references */
	if(!url.match(/^(https?|ftp|telnet|ldap|irc|nntp|news|irc)/) ) {
		url = "http://" + url;
	}
	if( habla_window.config.vars["url_handler"] && !url.match(document.domain)) {	
		return habla_window.config.vars["url_handler"] + "?siteid=" + hbl.siteid + "&wcsid=" + hbl.client.sid + "&url=" + url;
	}
	return url;
} 	


hbl.hwindow.util.bufferToHTML = function(buffer,myname,local_name) {
  var rv = '';

  for( i=0; i < buffer.length; ++i ) {
		// Process message here.. to see if it should be displayed
		var msg = habla_window.display_pipeline.run(buffer[i][1]);
		if(msg) {
   	 //chats_received++; 
	    var clas = "person2";
	    if( myname==buffer[i][0] ) clas = "person1";
	    rv += '<p'
	    if( i==buffer.length-1 )
	      rv += ' id="habla_bottom_line"';
	    rv += '><span class="' + clas + '">';
			if( clas=="person1" )
				rv += "&gt;";
			else
				rv += (local_name != undefined ? local_name : buffer[i][0]) + ":";
		
			/** This would be the cleanest place for a DISPLAY pipeline to occur **/
			rv += '</span> ' + msg + '</p>';
		}
	}
	return rv;
	
}


hbl.hwindow.panel.prototype.send = function() {
	hbl.util.debug("wc_send");
  var r;

  if(!this.wcsend) {
		this.wcsend = document.getElementById("habla_wcsend");
  }

  if( this.wcsend.value ) {
    try {
      var msg = this.wcsend.value;
      this.wcsend.value = "";
			
			/** input pipeline [spam filtering etc..]**/
			msg = this.send_pipeline.run(msg);
			if(msg) {
				this.client.sendmessage(msg);
			}
      
			this.normal();
		} catch( e ) {
      throw e;
    }
  }
  return false;
}



hbl.hwindow.panel.prototype.away_header_helper = function() {
	if(! this.getStatus() ){
		return this.config.vars["not_available_text"];
	}else {
		if(this.config.vars["show_away_as_header"] && this.getMessage()) {
			last_msg = this.getMessage().substr(0,10);
			return (".." + last_msg + ".." );
		}else {
			return this.config.vars["away_text"];
		}
	}
		
}



/** -------------------------------------------------------------------------------------------------------------------- **/



/** The CONFIG LOADER **/
hbl.hwindow.config.prototype.load_config = function() {	
	
	// Plugins here?
	// Probably should eventually make this a priority queue
	this.plugins = new hbl.util.pluginlist();
	
	// Ok load the config for config
	this.palette = new Array();
	this.palette['mainbg']   = '#ffffff';
	this.palette['mainfg']   = '#000000';
	this.palette['titlebg']  = '#333333';
	this.palette['titlefg']  = '#ffffff';
	this.palette['buttonbg'] = '#111111';
	this.palette['buttonfg'] = '#ffffff';
	this.palette['buttonhi'] = '#ff0000';
	this.palette['control']  = '#cccccc';
	this.palette['link']     = '#e75917';
	this.palette['linkhi']   = '#ff0000';
	this.palette['local']    = '#ff0000';
	this.palette['remote']   = '#0000ff';
	
	this.palette['titlebg_highlight']  = 'red';
	this.palette['titlefg_highlight']  = '#00ffff';

	this.vars = new Array();
	this.vars["bottom_margin"]      = "10";
	this.vars["right_margin"]       = "10";
	this.vars["position"]           = "fixed";
	this.vars["position_ie6"]       = "absolute";
	this.vars["width"]              = "250px";

	this.vars["say_text"] = "Say: ";
	this.vars["input_box_size"]   = "40";
	this.vars["check_for_status"] = "checking for chat status...";

	/* enable google analytics by default */
	this.vars["disableGoogleAnalytics"] = 0;
	

  /* let people select polling or sleeping */
  this.vars["poll"] = false;
  if( hbl.util.BrowserDetect.browser=="Opera" ) {
    this.vars["poll"] = true;
  }

	
	//----------- kevin's stuff
	// hbl.hwindow.dimension_hack is what was added here
	
  /* you had this backwards. */
  hbl.util.debug("bd is " + hbl.util.BrowserDetect.backwards_dimension);
	if( hbl.util.BrowserDetect.backwards_dimension ) {
    hbl.util.debug("212/24");
  	this.vars["input_width"]	      = "212px"; 
    this.vars["input_height"]       = "24px"; 
  } else {
    hbl.util.debug("202/18");
    this.vars["input_width"]	      = "202px"; 
    this.vars["input_height"]       = "18px"; 
  }
	//-----------------------------------
	
	
	this.vars["in_chat_text"]       = "now chatting";
	this.vars["before_chat_text"]   = "click here to chat";
	this.vars["not_available_text"] = "not available";
	this.vars["away_text"]					= "Away";
	
	this.vars["offline_message"]    = "<p><em>No one is available for chat right now.  Please try again later.</em></p>";
	// show the hide/close/buttons
	this.vars["enable_buttons"]       = 1;
	this.vars["local_name_override"]  = undefined;

	this.vars["url_handler"]				= "http://static.hab.la/js/html/url_handler.html"

	this.vars["parse_links"]				= 1;
	this.vars["is_inline"]		      = 0;
	this.vars["start_expanded"]	    = 0;
	this.vars["hide_not_available"]	= 0;	
	this.vars["append_to_body"]	    = 1;
	this.vars["show_away"]          = 0;  // don't show away messages by default
	this.vars["hide_when_away"]	= 0;
	this.vars["show_away_as_header"] = 0;


	this.style = new Array();
	this.style["habla_window_look"]     =  'margin: 0; padding: 0; border: 0; outline: 0; font-weight: inherit; font-style: inherit; font-size: 12px; font-family: verdana, arial, helvetica, sans-serif; text-align: left; vertical-align: baseline; line-height: 1; color: $palette["mainfg"]; background: $palette["mainbg"];';
	
	//Positions
	this.style["habla_window_position_normal"] =  'position: $vars["position"]; bottom: $vars["bottom_margin"]px; right: $vars["right_margin"]px;';
	this.style["habla_window_position_ie6"]    =  'position: $vars["position_ie6"]; bottom: $vars["bottom_margin"]px; right: $vars["right_margin"]px;';	
	// I bet I could render this using Javascript.
	this.style["habla_window_position_inline"] =  '';
	
	this.style["habla_window_position"] = this.style["habla_window_position_normal"];
	
	
	//this.style["habla_window_ie_hack"]  =  'position: $vars["position_hack"]; bottom: $vars["bottom_margin"]; right: $vars["right_margin"];';
	this.style["habla_topbar_a"]        =  'color: white; text-decoration: none;';
	this.style["habla_topbar_a_hover"]  =  'color: white;';
	this.style["habla_topbar_a_habla_button_hover"] = 'background-color: $palette["buttonhi"];';
	this.style["habla_convo_p"]       = 'margin: 0; padding: 0; text-indent: -20px; background: transparent;';
	this.style["habla_convo_person1"] = 'color: $palette["local"] ; padding-right: 5px;';
	this.style["habla_convo_person2"] = 'color: $palette["remote"] ; padding-right: 5px;';	
	this.style["habla_input"]         = 'padding: 3px; margin: 0; font-family: verdana, arial, helvetica; font-size: 12px; font-weight: normal;';
	this.style["habla_input_input"]   = 'border: 2px solid $palette["control"]; padding: 1px 3px 1px 3px; margin: 0; font-family: verdana, arial, helvetica; font-size: 12px; width: $vars["input_width"]; height: $vars["input_height"]; line-height: $vars["input_height"]; background: none;'
	this.style["habla_input_input_highlight"]   = 'border: 2px solid $palette["control"]; padding: 1px 3px; margin: 0; font-size: 12px; width: $vars["input_width"]; height: $vars["input_height"]; background: none;'
	
	this.style["habla_link"]          = 'padding: 3px 0 5px 0; font-family: verdana, sans-serif; text-align: center; text-transform: uppercase; font-size: 9px; letter-spacing: 2px; font-weight: bold; color: #aaa;';
	this.style["habla_link_a"]        = 'font-family: verdana, sans-serif; text-transform: uppercase; font-size: 9px; letter-spacing: 2px; font-weight: bold; color: $palette["link"]';
	this.style["habla_link_a_hover"]  = 'font-family: verdana, sans-serif; text-transform: uppercase; font-size: 9px; letter-spacing: 2px; font-weight: bold; color: $palette["linkhi"];';
	
	// Added to replace the previous javascript style definitions
	this.style["habla_main"] = 'background: $palette["mainbg"]; width: $vars["width"]; border: 1px solid black; font-size: 14px; font-family: "Lucida Grande", verdana, helvetica, arial, sans-serif';
	
	this.style["habla_closebutt"]  = 'float: right; background $palette["buttonbg"]; padding: 0px 6px 2px 6px; margin-left: 3px; font-weight: bold; color: $palette["buttoncfg"]; text-decoration: none';
	this.style["habla_minbutt"]    = 'float: right; background $palette["buttonbg"]; padding: 0px 6px 2px 6px; margin-left: 3px; font-weight: bold; color: $palette["buttoncfg"]; text-decoration: none';

	this.style["habla_oplink"]    = 'font-weight: normal; color: $palette["titlefg"] ';
	this.style["habla_topbar"]    = 'background: $palette["titlebg"]; color: $palette["titlefg"]; padding: 3px';
	this.style["habla_topbar_highlight"]    = 'background: $palette["titlebg_highlight"]; color: $palette["titlefg_highlight"]; padding: 3px';

	//this.style["habla_away_message"]     = ' ';
	//this.style["habla_away_message"]     = 'height: 150px; overflow: auto; border-bottom: 1px dotted $palette["control"]; background: transparent; line-height: 1.5em; padding:3px 3px 3px 23px ';

	this.style["habla_convo"]     = 'height: 150px; overflow: auto; border-bottom: 1px dotted $palette["control"]; background: transparent; line-height: 1.5em; padding:3px 3px 3px 23px ';
	this.style["habla_form"]      = 'margin: 0; padding: 0 ';
	//this.style["habla_input"]     = 'margin: 0';
	
	
	/** We'll have one CSS template to hold all the CSS**/
	this.css_template = '<style type="text/css">' +
	'#habla_window { $style["habla_window_look"] }' +
	'#habla_window { $style["habla_window_position"] }' +
//	'body>#habla_window { $style["habla_window_ie_hack"] }' +
	'#habla_topbar a { $style["habla_topbar_a"] }' +
	'#habla_topbar a:hover { $style["habla_topbar_a_hover"] }' +
	'#habla_topbar { $style["habla_topbar"] }' +
	'#habla_topbar_highlight { $style["habla_topbar_highlight"] }' +
	'#habla_topbar a.habla_button:hover { $style["habla_topbar_a_habla_button_hover"] }' +
    '#habla_convo p { $style["habla_convo_p"] }' +
    '#habla_convo .person1 { $style["habla_convo_person1"] }' +
    '#habla_convo .person2 { $style["habla_convo_person2"] }' +
    '#habla_input { $style["habla_input"] }' +
    '#habla_input input { $style["habla_input_input"] }' +
    '#habla_link { $style["habla_link"] }' +
    '#habla_link a { $style["habla_link_a"] }' +
    '#habla_link a:hover { $style["habla_link_a_hover"] }' +
    '</style>$ie_6_hack';

	/* we really don't need the IE hack as much as we use to */
	// really we should just do browser detection.
	// HIDE it for IE 5 [and other unsupported browsers]
	// And show it for any newer version. 

	if(hbl.util.BrowserDetect.backwards_position) {
		//Ok we are using an older version of IE.
		//this.ie_6_hack  = " ";
		this.style["habla_window_position"] = this.style["habla_window_position_ie6"];
	}
	
	/*

	this.ie_6_hack  = "<!--[if gte IE 5.5]>\n" +
	//"<![if lt IE 7]>\n" +
	'<style type="text/css">\n' +
	'div#habla_window {' +
	'  right: auto; bottom: auto;' +
	"  left: expression( ( -$vars[\"right_margin\"] - habla_window.offsetWidth + ( document.documentElement.clientWidth ? document.documentElement.clientWidth : document.body.clientWidth ) + ( ignoreMe2 = document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft ) ) + 'px' );" +
	"  top: expression( ( -$vars[\"bottom_margin\"] - habla_window.offsetHeight + ( document.documentElement.clientHeight ? document.documentElement.clientHeight : document.body.clientHeight ) + ( ignoreMe = document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop ) ) + 'px' );\n" +
	"</style>\n" +
	//"<![endif]>\n" +
	"<![endif]-->\n";
  if( document.compatMode ) {
    if( document.compatMode!="backCompat" ) {
	    this.ie_6_hack  = "<!--[if gte IE 5.5]>\n" +
	"<![if lt IE 7]>\n" +
	'<style type="text/css">\n' +
	'div#habla_window {' +
	'  right: auto; bottom: auto;' +
	"  left: expression( ( -$vars[\"right_margin\"] - habla_window.offsetWidth + ( document.documentElement.clientWidth ? document.documentElement.clientWidth : document.body.clientWidth ) + ( ignoreMe2 = document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft ) ) + 'px' );" +
	"  top: expression( ( -$vars[\"bottom_margin\"] - habla_window.offsetHeight + ( document.documentElement.clientHeight ? document.documentElement.clientHeight : document.body.clientHeight ) + ( ignoreMe = document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop ) ) + 'px' );\n" +
	"</style>\n" +
	"<![endif]>\n" +
	"<![endif]-->\n";
    }
  }
	*/
	// GLOBAL template:
	this.global_template = "$css_template"
}

/** Render part of the CSS (mainly replacing $var with value)**/
hbl.hwindow.config.prototype.render_part = function(part) {	
	var buffer = "";
	if(part == undefined)
		return "";

	for(var i=0;i<part.length;i++) {
		if(part.substr(i,1) == '$') {
			var done = 0;
			var to_check = "";

			var j;
			for(j=i+1; ((j<part.length) && !done);j++){
				if(part.substr(j,1) != ' '  && part.substr(j,1) != '$' && part.substr(j,1) != "]"){
					to_check += part.substr(j,1);
				}else if(  part.substr(j,1) == ']' ){ 
					done=1;
					to_check += part.substr(j,1);
					i = j;
				}else {
					done = 1
					i = j-1;
				}

			}

			//in case we hit the end without finishing early
			if(j == part.length){
				i = part.length;
			}

			// ok we have something to check
			try {
				buffer += this.render_part(eval("this." + to_check));
			}catch (e) {
				// I am not sure what to do with errors (deal with this later)
				debug("Error rendering:" + to_check + " " + e.name + " " + e.message);
			}

		}else {
			buffer += part.substr(i,1);
		}

	}
	return buffer;
}

hbl.hwindow.config.prototype.render_js_style = function(obj, css_name) {
		return hbl.css.set_css(obj, this.render_part( this.style[css_name] ) )
}

hbl.hwindow.config.prototype.load_from_css = function(part) {	
	for(var i=0;i<part.length;i++) {
		if(part[i] == '#') { // start an element
			var done = 0;
			var element = "";
			var ebody   = "";
			
			var j;
			for(j=i+1; ((j<part.length) && !done);j++){
				if(part[j] != ' '  && part[j] != '{'){
					element += part[j];
					i = j;
				}else {
					done = 1
					i = j-1;
				}
			}
			
			done  = 0;
			var start = 0;
			var k;
			for(k=i; ((k<part.length) && !done); k++ ) {


				if(part[k] == "}") {
					start = 0;
					done  = 1;
				}
				if(start) {
					ebody += part[k];
				}
				if( part[k] == "{") {
					// go at it
					start = 1;
				}
			}
			i = k;

			if(element.length > 0 && ebody.length > 0) {
				// add it 
				this.style[element] = ebody;
			}
	
		} // end loop for each element
	}//end if
} // end function load from CSS

hbl.hwindow.config.prototype.export_as_js_css = function() {	
	var buffer = "";
	for (var a in this.style) {
		if(a.match(/habla/)  && !a.match(/hack/)) {
			var ren = this.render_part(this.style[a]);
			buffer += "'#" + a + "{' +" + "\n";
			var parts = ren.split(";");
			for (var p in parts) {
				if(parts[p].length > 1)
					buffer += "\t'" + parts[p] + ";' + " + "\n";
			}
			buffer += "'}' + \n";
		}
	}
	return buffer;
}

hbl.hwindow.config.prototype.render = function() {
	// OK, I am not sure where this code should go.. maybe I'll make another function to handle it?
	
	if(hbl.util.BrowserDetect.backwards_position   && ! this.vars["is_inline"] ) {
			
			hbl.oldonresize = false;
			if(window.onresize && typeof(window.onresize) == "function")  hbl.oldonresize = window.onresize;
			
			window.onresize = function(e) { hbl.util.debug("resized");
																			if(window.event) e= window.event;
																			habla_window.eventmgr.handle("document_resized", {"event": e });																							
																			if(hbl.oldonresize) hbl.oldonresize(); 
																		}

	
			hbl.oldonscroll = false;
			
			if(window.onscroll && typeof(window.onscroll) == "function")  hbl.oldonscroll = window.onscroll;
			window.onscroll = function(e) { hbl.util.debug("scrolled");
																			if(window.event) e= window.event; 
																			habla_window.eventmgr.handle("document_scrolled", {"event": e });
																			if(hbl.oldonscroll) hbl.oldonscroll(); 
																		}
			
			// ok now register the events
			habla_window.eventmgr.register("document_scrolled", function(arg) { arg["window"].config.ie_position_fix(arg["event"], arg["window"]); })
			habla_window.eventmgr.register("document_resized", function(arg) { arg["window"].config.ie_position_fix(arg["event"], arg["window"]); })
			
			hbl.util.debug("set hacks for IE.. now much cleaner");
	}
		
	return this.render_part(this.global_template);
}

hbl.hwindow.config.prototype.ie_position_fix = function(e, hwindow) {
	// We probably don't care about e.

	// so we need to move the hab.la window
	var newx = -this.vars["right_margin"] - hwindow.div.offsetWidth + (document.documentElement.clientWidth ? document.documentElement.clientWidth: document.body.clientWidth) +  (  document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft );
	var newy = -this.vars["bottom_margin"] - hwindow.div.offsetHeight + (document.documentElement.clientHeight ? document.documentElement.clientHeight: document.body.clientHeight) +  ( document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop );

	hbl.util.debug("right:" + this.vars["right_margin"]);
	hbl.util.debug("offset:" + hwindow.offsetWidth);
	hbl.util.debug("width1:" + document.documentElement.clientWidth);
	hbl.util.debug("scroll1:" + document.documentElement.scrollLeft);
	hbl.util.debug("scroll:" + document.body.scrollLeft);
	hbl.util.debug("width:" + document.body.clientWidth);
	
	
	

	hbl.util.debug("x:" + newx);
	hbl.util.debug("y:" + newy);
	
	habla_window.div.style.top = newy;
	habla_window.div.style.left = newx;
	
}
/** Add a simple function to set it not inline -- do we want a toggle, that'd be crazy. **/
hbl.hwindow.config.prototype.setInline = function(val) {
	// I am absolutely sure I could do this in the window itself.
	
	if(val) {
			//If we are setting it inline ( and we assume we haven't been rendered yet)
			this.vars["is_inline"] = 1;
			this.style["habla_window_position"] = this.style["habla_window_position_inline"];
			
	}else {
		this.vars["is_inline"] = 0;
		if(hbl.util.BrowserDetect.backwards_position) {
			//Ok we are using an older version of IE.
			//this.ie_6_hack  = " ";
			this.style["habla_window_position"] = this.style["habla_window_position_ie6"];
		}else {
			this.style["habla_window_position"] = this.style["habla_window_position_normal"];
			
		}
	}
}	
/** -------------------------------------------------------------------------------------------------------------------- **/
/*
	Stub function for all event handlers in the window:
	
	[I can add throttling to the event manager]
*/
hbl.hwindow.panel.prototype.onWindowClick = function() {
	habla_window.eventmgr.handle("window_click");
}
hbl.hwindow.panel.prototype.onWindowFocus = function() {
	habla_window.eventmgr.handle("window_focus");
}
hbl.hwindow.panel.prototype.topBarClicked = function() {
	habla_window.eventmgr.handle("window_topbar_clicked");
}
hbl.hwindow.panel.prototype.closeClicked = function() {
	habla_window.eventmgr.handle("window_topbar_close_clicked");
}
hbl.hwindow.panel.prototype.onWindowSubmit = function(e) {
	habla_window.eventmgr.handle("window_submit", {"event": e});
}

/** -------------------------------------------------------------------------------------------------------------------- **/
// Pipline pieces

hbl.pipelines.nickname = function(msg,hwindow) {
	if( msg.substr(0,6)=="/nick " ) {
    var nickname = msg.substr(6);
    hwindow.client.setnickname(nickname);
  	return undefined;
	} 
	
	return msg;
}

hbl.pipelines.wrap_text = function(msg, hwindow) { //999 run after somethings, but before HTMLizing things
	return (hwindow.config.vars["parse_links"] ? hbl.hwindow.util.wrap_and_create_links( msg) : hbl.hwindow.util.wrap(msg,21) );
}

hbl.pipelines.emoticons = function(msg, hwindow) { //1000 priority (run after wrap_text)
	msg = msg.replace(/\;\-\)/,"<code><big>;-)</big></code>");
	msg = msg.replace(/\:\-\)/,"<code><big>:-)</big></code>");
		
	return msg;
}

hbl.pipelines.push_url = function(msg, hclient) {
	if(msg.substr(0,6)=="!push ") {
		var url = msg.substr(6,msg.length - 6 );
		hbl.util.debug(url);
		document.location=hbl.hwindow.util.get_habla_url( url );
		return undefined;
	}
	return msg;
}



/** -------------------------------------------------------------------------------------------------------------------- **/
/*
	These functions are the ones you will probably need to modify
	to change the functionality of HABLA
	Thus, I put them down here
	out side of everything else.

*/

/*
	Event Handlers for the BACKEND CHAT CLIENT

	[ I could have the event manager pass in the object representing habla, that'd be super cool]
*/
hbl.events.onChatStarted = function(arg) {}
hbl.events.onChatUpdated = function(arg)	{
	// Handles start, local_update, and remote_update event types
	var type = arg["type"];
	
	
	arg["window"].loadBuffer(hbl.client.buffer, hbl.client.myname);
	// I'll probably want to get rid of habla_window I hate GLOBALs
	
	if(type == "start") {
		// If there is chat there.. expand it
		arg["window"].expand();
	}
	
	if(type == "remote_update") {
		// highlight it here
		arg["window"].highlight();
		
		// I can probably look in the buffer
		var last_msg = "";
		if(  hbl.client.buffer &&  hbl.client.buffer[hbl.client.buffer.length -1] ){
			last_msg = hbl.client.buffer[hbl.client.buffer.length-1][1].substr(0,10);
			arg["window"].setHeader(".." + last_msg + "..");
		}
		// Set the title to note a new message
		
		if( document.title.indexOf("Message Received")<0 ) { 
		  hbl.oldtitle    = document.title
		  document.title   = "(Message Received: " + last_msg + ") " + hbl.oldtitle
		}
		
		//If it's not expanded.. we could add something to the header..

    /* cut the poll timeout once they start chatting */
    hbl.client.current_timeout = hbl.client.chatting_timeout;
		
	}
	
	// if notExpanded, expand
	
	// if closed.. show it, but not expanded.

}

hbl.events.onOpstatusStatusChanged = function(arg) {
	var available = arg["available"];
	var status    = arg["status"];
	var message   = arg["message"];
	
	
	/* ok here's what happens when op status changes */
	//hbl.habla.paint();
	arg["window"].setStatus(status);
	arg["window"].setMessage(message);

	if(available && (!status || status == "chat" || !arg["window"].config.vars["hide_when_away"]) ) {
		if(! arg["window"].getAvailable()){
				arg["window"].reloadBuffer();
		}
	
		arg["window"].setAvailable(true);
		
		arg["window"].show();
		
		arg["window"].setHeader(arg["window"].config.vars["before_chat_text"] );
		/* maybe check and see if it's expanded or not */
		if(arg["window"].expanded) {
			arg["window"].setHeader(arg["window"].config.vars["in_chat_text"] );
		}
		
	}else {
		arg["window"].setAvailable(false);
		
		arg["window"].setHeader(arg["window"].away_header_helper() );
		
		arg["window"].setConvo( (arg["window"].getMessage() && arg["window"].config.vars["show_away"] ? arg["window"].getMessage() : arg["window"].config.vars["offline_message"]) );
	}
	
}


/*
	Event Handlers for the ACTUAL CHAT WINDOW
*/


hbl.events.onWindowFocus = function(arg) {
	
	//	if(hbl.util.doThrottle() ) 	return;
		hbl.util.debug("focused");
		
	// Focused
	if(hbl.oldtitle) 
		document.title = hbl.oldtitle;
	
	if(arg["window"].getAvailable() ){
		arg["window"].setHeader(arg["window"].config.vars["in_chat_text"] );
	}else {
		arg["window"].setHeader(arg["window"].away_header_helper() );
	}
	arg["window"].normal();
	
	// I need some way of referencing the item that created this!
	
}



hbl.events.topBarClicked  = function(arg) {
	// I need a double click test
	// I need to make Throttle a little bit nicer.. and a lot smarter
	hbl.util.debug("topBarClicked " + arg["window"].expanded);
	if(hbl.util.doThrottle() ) 	return false;
	
	//we'll take it as focus

	arg["window"].normal();
	
	// Checked if expanded
	if(arg["window"].expanded) {
		arg["window"].compress();
		hbl.client.eventmgr.handle("window_compressed");
		
	}else {
		arg["window"].expand();
		arg["window"].wcsend.focus();
		
		if(arg["window"].getAvailable() ) {
			arg["window"].setHeader(arg["window"].config.vars["in_chat_text"] );
		}else {
			// Do the no one is around message
			arg["window"].setHeader(arg["window"].away_header_helper() );
			
			//habla_window.setConvo("");
			arg["window"].setConvo( (arg["window"].getMessage() && arg["window"].config.vars["show_away"] ? arg["window"].getMessage() : arg["window"].config.vars["offline_message"]) );

			hbl.client.eventmgr.handle("window_expanded");
		}
	}
  return false;
}




hbl.events.closeClicked = function(arg) {
	// set the throttle
	hbl.util.doThrottle();
	hbl.util.debug("CLOSED CLICKED");

	if(arg["window"].expanded) {
		arg["window"].compress();
		hbl.client.eventmgr.handle("window_compressed");
	}else {
		arg["window"].hide();
    /* stop polling getmessages, I guess .. */
    hbl.client.current_timeout = hbl.client.offline_timeout;
		hbl.client.eventmgr.handle("window_closed");
	}
	// should I do other things?
  return false;
}

/*
	Other events that I never do anything with:
	
	window_closed
	window_compressed
	window_expanded

*/

/*
	I am sure there is a way to put this somewhere cleaner, but right now
	I need the reference to habla_window.
*/


hbl.events.onWindowSubmit = function(arg) {
	var e = arg["event"];
	
	// Maybe fire some sort of event handler if it's registered
	//var e = event;
	var keynum;
  /* IE/fox difference again */
  if( window.event )  {
		e = window.event;
		hbl.util.debug(e);
    keynum = e.keyCode;
  } else if( e.which ) {
    keynum = e.which;
  }
  /* 13 == enter key */
  if( keynum==13 ) {
		
		/* I REALLY DON'T like the hardcoded reference here */
   	arg["window"].send();
		/* is there some way I can get rid of it */
    return false;
  } else {
    return true;
  }
}
//
//
/** -------------------------------------------------------------------------------------------------------------------- **/
/*
	This is where plugins go.
	
	Essentially a plugin let's you load hooks into Hab.la via a nice "clean" interface, so if you want to add a bunch of new event handlers
	or say.. the URL push plugin, or something like that.  It's now trivial to add.
	
	You just need a class.  that implements the method "load(q)"
	q is an array containing elements
	q["hwindow"] -- Habla window
	q["client"]  -- Habla client
	q["conf"]    -- the configuration element
	
*/
/*
	Ok 
*/
hbl.plugins.googleanalytics = function () {
	this.load = function(q) {
		/* there are a few pieces to a hab.la plugin 
		
		1. check compatibility
		2. load additional event handlers
		3. celebrate?
		
		*/
		hbl.util.debug("loading google analytics");
		/* check compatibility */
		if(window["urchinTracker"] != undefined && !q["conf"].vars["disableGoogleAnalytics"] ) {
			// ok if urchinTracker is defined we are all set.
			
			q["hwindow"].eventmgr.register("receive_message", this.onReceiveMessage );
			q["hwindow"].eventmgr.register("send_message", this.onSendMessage );
			q["hwindow"].eventmgr.register("chat_started", this.onChatStarted ); 
			
			q["hwindow"].eventmgr.register("window_expanded", this.onExpandChat );  
			q["hwindow"].eventmgr.register("window_compressed", this.onCompressChat ); 
			q["hwindow"].eventmgr.register("window_closed", this.onCloseChat ); 
		
			/*
			q["client"]
			q["hwindow"]
			this.conf = q["conf"]
			*/
		}
		
	}
	
	// Some event handlers
	this.onSendMessage = function(args) {
		urchinTracker ('/habla/send_message');
	}
	
	this.onExpandChat = function(args) {
		urchinTracker ('/habla/expand_chat');
	}

	this.onCompressChat = function(args) {
		urchinTracker ('/habla/compress_chat');
	}	
	
	this.onCloseChat = function(args) {
		urchinTracker ('/habla/close_chat');
	}	
	
	this.onReceiveMessage = function(args) {
		urchinTracker ('/habla/receive_message');
	}
	
	this.onChatStarted = function(args) {
		urchinTracker ('/habla/chat_started');
	}
	
}

















// So we don't break old people's code
function wc_config() {
	return new hbl.hwindow.config();
}


var hblHasinit =0;

/*
	This is the startup function that is called either onTimeout or on window load.
*/


/*** Ok, we want to still allow one to use WCINIT to create an object, BUT we want to take a slighly more event driven model of everything ***/
function wc_init(id, config, divid) {
	if(hblHasinit) return;
	hblHasinit = 1;
	//First thing we'll do is make sure we are using a supported browser
	hbl.util.BrowserDetect.init();
	if(! (hbl.util.BrowserDetect.supported) && hblHideUnsupported){
		hbl.util.debug("The Browser you are using is not supported by Hab.la - " + hbl.util.BrowserDetect.browser + hbl.util.BrowserDetect.supported);
		return;
	}
	
  hbl.siteid = id;
  hbl.divid  = divid;

	hbl.wcsid = hbl.util.get_cookie("wcsid");
	if( hbl.wcsid==null ) hbl.wcsid="";

  hbl.config = config;
	if(hbl.config == undefined || hbl.config.render == undefined )
		hbl.config = new hbl.hwindow.config();

	// Add plugins:
	hbl.config.plugins.add(new hbl.plugins.googleanalytics() );	


	// it would be great to get rid of this.
	document.write(hbl.config.render());
	
	// Eventually we'll want to do something like
	// nclient = new client(id,wcsid)
	// nclient1 = new client(id1,wcsid1)
  hbl.started = 0;
  
	hbl.prev_onload = window.onload;
	window.onload = function() { habla_start_func(hbl.prev_onload); };
	

  // My own special hack here for setTimeout
  window.setTimeout(habla_start_func, 1500);

}

/**
	I am not 100% convinced how we want to start hab.la, extracting it to this function gives me some leeway.
	
**/


function habla_start_func(f_after) {
	  if(hbl.started) return;
    hbl.started=1;

    if( f_after && typeof( f_after) == "function")
	     f_after();
	
	// Maybe you create the window here
	  hbl.util.debug("onload");
		hbl.util.debug(hbl.siteid);
		hbl.util.debug(hbl.wcsid);

		// create an event manager for the world here?
		hbl.eventmgr = new hbl.util.eventmanager();

		habla_window = new hbl.hwindow.panel(hbl.client, hbl.config, hbl.divid, hbl.eventmgr);
		
		hbl.eventmgr.setWindow(habla_window);
		
		/* load the plugins */
		hbl.util.pluginloader(hbl.config, hbl.client, habla_window);
		
		hbl.client.start(hbl.siteid, hbl.wcsid, hbl.eventmgr, habla_window);
		
		// Down the line I can do this using an event handler
		// Event Handler is implemented .. BUT
		// could we probably still want to at least initially enable this for people 
		// so they can see it's working
		// Also probably need to play with config options
		if(! hbl.config.vars["hide_not_available"]) habla_window.show();
		if( hbl.config.vars["start_expanded"] )     habla_window.expand();
	
	
}


