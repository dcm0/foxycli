//(function(window){
	
	//Req: npm install sentiment
	//req: npm install lowdb
	//req: npm install FileSync
	//req: npm install -S moment
	//req: npm install sorted-array
		
	
	function Box(cfg) {
		
		var sentiment = require('sentiment');
		const low = require('lowdb');
		const FileSync = require('lowdb/adapters/FileSync');
		var SortedArray = require("sorted-array");
		var moment = require('moment');
		var bagArray;

		const adapter = new FileSync('db.json');
		const db = low(adapter)		
		
		var config = cfg || {};

		var timeInterval = config.timeInterval || 180; //Bag size in minutes, default 3 hour bags
		
		resetBagArray();
		


		// Returns the configuration
		this.getConfig = function() {
			return config;
		}

		this.init = function() {

			//Not cleared ever at the moment
			db.defaults({uts: []}).write()		
			db.read();
			//console.log(db.getState());
			console.log('DB loaded');
			generateBags();
		}

		this.addText = function(utt) {
			if(utt === 'undefined'){
				console.log("returning from undefined");
				return;
			}
			
			let now = moment().valueOf();
			//Parse the JSON
			//console.log("After the check n");
			//console.log(utt);
			if("data" in utt){
				text = getMostConfidentText(utt);
			}else{
				text = utt.query;
			}
			
			//Sentiment score
			//console.log(text);
			let sjson = sentiment(text);
			//console.log("Sentiment:");
			//console.log(sjson);			
			
			if(text.length < 4){
				console.log("Skipping");
				return false;			
			}else{
				//Add the json + setiment to db
				//console.log("pushing", {timestamp: now, sentiment: sjson, body: text, raw:utt});
				db.get('uts').push({timestamp: now, sentiment: sjson, body: text, raw:utt}).write();			
				addUtt(sjson, text, now);
				//console.log(bagArray.array.length, JSON.stringify(bagArray), "or", JSON.stringify(bagArray.array));
				//console.log("returning true!");
				return true;
			}
		}
		
		this.getBags = function() {
			//console.log(bagArray.array.length, " sending back", JSON.stringify(bagArray), "or", JSON.stringify(bagArray.array));
			return bagArray;
		}


		this.setTimeInterval = function(ti) {
			this.timeInterval = ti;
			//Clear the bags
			resetBagArray();
			//classify all the data using the new TI
			generateBags();
			
		}

		

		// Private methods
		function resetBagArray(){
			console.log('bag array cleared');
			bagArray = new SortedArray([], function (a, b) {
				if (a.max() === b.max()) return 0;
				return a.max() > b.max() ? -1 : 1;
	        });
		}
		
		
		function generateBags() {
			//Loop through all the stuff in the db, ordered by time desc and add it
			console.log("getting the old uts from the db");
			let oldUts = db.get('uts').sortBy('timestamp').value();
			console.log("Found old uts", oldUts.length);
			for (var i = 0, len = oldUts.length; i < len; i++) {
				if(oldUts[i]['body'].length > 3){
					addUtt(oldUts[i]['sentiment'], oldUts[i]['body'], oldUts[i]['timestamp']);
				}
			}
		}
		
		function addUtt(sj, text, timestamp){
			console.log('adding Utt');
			//console.log(sj);
			let score = sj.score;
			//check the time for new bag creation
			let bagId = getBagForTimestamp(timestamp);
			//console.log('got bag');
			//console.log(bagId);
			//add the words to the bag with the utterance sentiment
			//console.log("BagArray ", bagArray);
			bagArray.array[bagId].addText(text, score);
			//console.log('added');
		}
		
		function getBagForTimestamp(timestamp){
			//return bag index to add text with timestamp given current timeInterval
			let idx = -1;
			console.log('Finding bag', timestamp);
			for (var i = 0; i < bagArray.array.length; i++){
				if(bagArray.array[i].inRange(timestamp)){
					idx = i;
				}
			}
			
			if(idx<0){
				//console.log('Creating a bag');
				//Nothing acceptable. So create a bag around this timestamp and insert it
				console.log(bagArray.array.length);
				if(bagArray.array.length < 1){
					//no bags at all, make one
					console.log("Creating first bag");
					var nb = new Bag({min: timestamp, timeInterval: timeInterval});
					//console.log("madeabag");
					bagArray.insert(nb);
					//console.log("Inserted at index:");
					console.log(bagArray.search(nb));
					//console.log("inserted?");
					
				}
				//console.log("1");
				//console.log(timestamp, " > ", (bagArray.array[0].max()));				
				while(timestamp>bagArray.array[0].max()){
					//create new bags of timeInterval size until we are done
					//console.log(timestamp, " > ", (bagArray.array[0].max()));	
					console.log("NewBag");
					let nextMin = moment(bagArray.array[0].max(), 'x').add(1, 'ms').valueOf();
					var nb = new Bag({min: nextMin, timeInterval: timeInterval});
					//console.log("madeabag");
					bagArray.insert(nb);
					//console.log("Inserted at index:");
					//console.log(bagArray.search(nb));
					
				}
				
				//console.log("2");
				if(bagArray.array[0].inRange(timestamp)){
					//Then the we have a new bag ready to use
					console.log("returning new bag 0");					
					return 0;
				}
				
				//if not then it must be an earlier bag
				//console.log("3");
				while(timestamp<bagArray.array[bagArray.array.length-1].min()){
					//create new bags of timeInterval size until we are done		
					//console.log("New old bag");
					let oldMax = bagArray.array[bagArray.array.length-1].min();
					//console.log("old max", oldMax, bagArray.array.length-1);
					let nextMax = moment(oldMax, 'x').subtract(1, 'ms').valueOf();
					var nb = new Bag({max: nextMax, timeInterval: timeInterval});
					//console.log("madeabag");
					bagArray.insert(nb);
					console.log("Inserted at index:");
					console.log(bagArray.search(nb));
//					bagArray.insert(new Bag({max: bagArray.array[bagArray.array.length].min, timeInterval: timeInterval}));
					
				}
				//console.log("4");				
				if(bagArray.array[bagArray.array.length-1].inRange(timestamp)){
					//Then the we have a new bag ready to use
					//console.log("returning new old bag ", bagArray.array.length-1);
					return bagArray.array.length-1;
				}
			}
			console.log("returning bag ", idx);
			return idx;
		}
		
		
		function getMostConfidentText(utj) {
		  let conf = 0;
		  let text = '';
		  for (var i in utj.data) {
		    if (utj.data[i].confidence > conf) {
		      conf = utj.data[i].confidence;
		      text = utj.data[i].text;
		    }
		  }
		  return text;
		}
		
		

	};
	
	
	//Bag class
	var Bag = function(cfg) {
		
		var moment = require('moment');
		
		console.log("Creating a bag object");
		var config = cfg || {};
		//console.log(config);
		var maxStamp = config.max || 0;
		var minStamp = config.min || 0;
			
		console.log(minStamp, maxStamp);
		if(maxStamp>0){
			console.log("Got a max");
			//console.log(maxStamp);
			var maxC = moment(String(maxStamp), 'x');
			//console.log(maxC);
			var mn = maxC.subtract(parseInt(config.timeInterval), 'minute');
			//console.log(mn);
			minStamp = mn.valueOf();
			//console.log("is it the creation?");
		}else if(minStamp>0){
			console.log("no max");		
			let minC = moment(minStamp, 'x');
			let mn = minC.add(parseInt(config.timeInterval), 'minute');
			//console.log(mn.valueOf()); 	
			maxStamp = mn.valueOf();
		}else{
			console.log("Empty init");
			minStamp = moment().valueOf();
			let minC = moment(String(minStamp), 'x');
			let mn = minC.add(parseInt(config.timeInterval), 'minute');
			maxStamp = mn.valueOf();	
		}
		console.log(minStamp, maxStamp);

		var list = [];
		
		this.addText = function(text, sentimentScore){
			console.log('AddingText', text, sentimentScore);
			let words = tokenize(text);
			//console.log("Got words", words);
			for (var i = 0, len = words.length; i < len; i++) {
			  this.add(words[i], sentimentScore);
			}			
			console.log('text added');
		}

		this.add = function(word, sentimentScore) {
			//console.log('adding word ', word);
			if(list[word]){
				//console.log('adding to count + rolling average');
				list[word].count++;
				list[word].sentiment += (sentimentScore/list[word].count);
			}else{
				//console.log('new word in this bag');
				list[word] = {count:1, sentiment:sentimentScore};
			}
			//console.log('added');
			
		}
		
		this.inRange = function(ts){
			//console.log("checkingRange");
			//console.log(moment(String(ts), 'x'));
			//console.log(moment(String(minStamp), 'x'));
			//console.log(moment(String(maxStamp), 'x'));
			let bool = moment(String(ts), 'x').isBetween(moment(String(minStamp), 'x'), moment(String(maxStamp), 'x'), null, '[]');
			//console.log(bool);
			return bool;
		}
		
		this.max = function(){
			return maxStamp;
		}
		
		this.min = function(){
			return minStamp;
		}
		
		this.getWords = function(){
			return list;
		}
		
		this.toJSON = function(){
		    
			//Want it to be 
			// {max: ts, min: ts, list: [word:{count:num, sentiment:num}]}
			
			let keys = Object.keys(list);	
			let listString = "{";
		    for (var i = 0, len = keys.length; i < len; i++) {
				listString = listString + "\"" + keys[i]+ "\"" + ":{\"count\":"+list[keys[i]].count+", \"sentiment\":"+list[keys[i]].sentiment+"},";
			}
		    listString = listString.slice(0, -1);
			listString = listString + "}";
			 
			//console.log(listString);
			let retJ = "{\"max\":"+maxStamp+", \"min\":"+minStamp+", \"list\":["+listString+"]}";
			//console.log(retJ);
			return retJ;
			
		
		}
	
	
		
		function tokenize(text) {
		    return text
		      .replace(/'/g, '')
		      .replace(/[^A-Za-zА-Яа-яçÇğĞıİöÖşŞüÜ0-9_]/g, ' ')
		      .replace(/\s\s+/g, ' ')
		      .split(' ').map(function (s) {
		        return s.toLowerCase();
		      });
		  }
		
	}
	
	module.exports = Box;

//	window.Bag = Bag;
//	window.Box = Box;


	//})(window);
