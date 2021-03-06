(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict'

module.exports = function (Score) {
  Score.build = function (obj) {
    var score = {}

    score.parts = buildParts(Score, obj.parts)
    merge(score, obj, 'parts')
    score.part = function (name, transform) {
      return Score(score.parts[name], transform)
    }
    return score
  }
}

function buildParts (Score, parts) {
  var parsed = {}
  Object.keys(parts).forEach(function (name) {
    var part = parts[name]
    if (typeof part === 'string') {
      parsed[name] = Score(part)
    } else {
      var source = part.score
      var options = merge({}, part, 'score')
      parsed[name] = Score(source, options)
    }
  })
  return parsed
}

function merge (dest, src, skip) {
  for (var n in src) {
    if (n !== skip) {
      dest[n] = src[n]
    }
  }
  return dest
}

},{}],2:[function(require,module,exports){
'use strict'

var Note = require('note-pitch')
var daccord = require('daccord')

module.exports = function (Score) {
  Score.fn.chords = function () {
    return Score(this, function (event) {
      var chord = parseChord(event.value)
      if (chord) {
        return Score.event(event, { chord: chord })
      }
    })
  }

  Score.fn.playChords = function () {
    return Score(this.chords(), function (event) {
      var chord = event.chord
      if (chord) {
        var notes = Note.transpose(chord.root, chord.intervals)
        return notes.map(function (note) {
          return Score.event(event, { value: note })
        })
      }
    })
  }
}

function parseChord (value) {
  var chord = {}
  chord.root = Note.parse(value[0])
  chord.type = value.substring(1)
  chord.intervals = daccord(chord.type)
  return (chord.root && chord.intervals) ? chord : null
}

},{"daccord":8,"note-pitch":11}],3:[function(require,module,exports){
'use strict'

var Note = require('note-pitch')
var Andante = require('andante')

module.exports = function (Score) {
  Score.fn.transpose = function (interval) {
    return Score(this, function (event) {
      var transposed = Note.transpose(event.value, interval)
      return transposed ?
        Score.event(event, {value: transposed, type: 'note'}) : event
    })
  }

  Score.fn.play = function (ctx, tempo, callback) {
    var andante = new Andante(ctx)
    return andante.play(this.notes(), tempo, callback)
  }

  Score.fn.notes = function (options) {
    return Score(this, function (event) {
      if (!event.note) {
        var note = Note.parse(event.value, null, null)
        if (note) {
          return Score.event(event, { note: note })
        } else {
          return null;
        }
      }
      return event;
    });
  }
}

},{"andante":7,"note-pitch":11}],4:[function(require,module,exports){
'use strict'

module.exports = function (Score) {
  /*
   * Return a sequence with the events between 'begin' and 'end'
   */
  Score.fn.region = function (begin, end) {
    return Score(this.sequence.filter(function (event) {
      return event.position >= begin && event.position < end
    }))
  }
}

},{}],5:[function(require,module,exports){
'use strict'

module.exports = function (Score) {
  /*
   * Return the total duration of the score
   */
  Score.prototype.duration = function () {
    var last = this.sequence[this.sequence.length - 1]
    return last.position + last.duration
  }

  Score.fn.toTempo = function (beatsPerMinute) {
    var factor = 60 / beatsPerMinute
    return Score(this.sequence, function (event) {
      return Score.event(event, {
        position: event.position * factor,
        duration: event.duration * factor
      })
    })
  }

  Score.fn.reverse = function () {
    return compactTime(this.sequence.reverse())
  }

  Score.fn.compact = function () {
    return compactTime(this.sequence)
  }

  function compactTime (sequence) {
    var position = 0
    return Score(sequence, function (event) {
      var evt = Score.event(event, { position: position })
      position += event.duration
      return evt
    })
  }

  /*
   * Repeat a sequence 'times' times
   *
   * @param {Integer} times - the number of times to be repeated
   */
  Score.fn.repeat = function (times) {
    var duration = this.duration()
    return new Score(this, function (event) {
      return range(times).map(function (i) {
        return Score.event(event, { position: event.position + duration * i })
      })
    })
  }

  Score.fn.loopUntil = function (max) {
    if (this.duration() === 0) return this

    var looped = []
    var total = this.sequence.length
    var event, index = 0, position = 0
    while (position < max) {
      event = this.sequence[index++ % total]
      looped.push(Score.event(event, { position: position }))
      position += event.duration
    }
    return new Score(looped)
  }

  /*
   * Delay
   *
   * Delay a sequence by a distance
   *
   * Params:
   * - distance: space between the event and the delayed event in ticks
   */
  Score.fn.delay = function (distance) {
    return Score(this, function (event) {
      return Score.event(event, { position: event.position + distance })
    })
  }
}

function range (number) {
  var array = []
  for (var i = 0; i < number; i++) {
    array.push(i)
  }
  return array
}

},{}],6:[function(require,module,exports){
var NOOP = function () {}

function Clock (ctx, options) {
  if (!(this instanceof Clock)) return new Clock(ctx, options)

  options = options || {}

  this.ctx = ctx
  this.lookahead = options.lookahead || 25.0
  this.scheduleAheadTime = options.scheduleAheadTime || 0.1
  this.ticksPerBeat = options.ticksPerBeat || 1
  this.tempo(options.tempo || 120)

  this.scheduler = NOOP
  this.nextTick = 0
  this.nextTickTime = 0

  this.timer = null
  this.running = false
}

Clock.prototype.schedule = function () {
  if (this.running) {
    var nextTime = this.ctx.currentTime + this.scheduleAheadTime
    while (this.nextTickTime < nextTime) {
      this.scheduler(this.nextTick, this.nextTickTime)
      this.nextTick++
      this.nextTickTime += this.tickInterval
    }
    setTimeout(this.schedule.bind(this), this.lookahead)
  }
}

Clock.prototype.tempo = function (newTempo) {
  if (arguments.length === 0) return this._tempo
  this._tempo = newTempo
  this.tickInterval = (60 / newTempo) / this.ticksPerBeat
  return this
}

Clock.prototype.start = function (tempo) {
  if (tempo) this.tempo(tempo)
  this.nextTick = 0
  this.nextTickTime = this.ctx.currentTime
  this.running = true
  this.schedule()
  return this
}

Clock.prototype.stop = function () {
  this.running = false
  if (this.timer) clearTimeout(this.timer)
  return this
}

module.exports = Clock

},{}],7:[function(require,module,exports){
'use strict'

var Clock = require('./clock.js')

/*
 * Andante
 *
 * Build an andante object
 */
function Andante (audioContext) {
  if (!(this instanceof Andante)) return new Andante(audioContext)

  this.ctx = audioContext
  this.clock = new Clock(audioContext)
}

Andante.prototype.play = function (sequence, tempo, player) {
  if (sequence.sequence) sequence = sequence.sequence
  var clock = this.clock
  clock.tempo(tempo)

  var timePerBeat = (60 / this.clock.tempo())
  var timePerTick = (timePerBeat / this.clock.ticksPerBeat) * 4
  var region = { lastIndex: 0 }
  clock.scheduler = function (tick, tickTime) {
    var begin = tick
    var end = (tick + 1)
    region = getRegion(region.lastIndex, sequence, begin, end)
    var time = function (t) { return t * timePerTick + 0.2 }
    region.events.forEach(function (event) {
      player(event, time, event)
    })
    if (region.lastIndex === sequence.length) clock.stop()
  }
  clock.start()
}

function getRegion (index, sequence, begin, end) {
  var region = { lastIndex: 0, events: []}
  for (var i = index, total = sequence.length; i < total; i++) {
    var event = sequence[i]
    if (event.position >= end) {
      region.lastIndex = i
      return region
    } else if (event.position >= begin) {
      region.events.push(event)
    }
  }
  region.lastIndex = i
  return region
}

if (typeof module === 'object' && module.exports) module.exports = Andante
if (typeof window !== 'undefined') window.Andante = Andante

},{"./clock.js":6}],8:[function(require,module,exports){
var SYMBOLS = {
  'm': ['m3', 'P5'],
  'mi': ['m3', 'P5'],
  'min': ['m3', 'P5'],
  '-': ['m3', 'P5'],

  'M': ['M3', 'P5'],
  'ma': ['M3', 'P5'],
  '': ['M3', 'P5'],

  '+': ['M3', 'A5'],
  'aug': ['M3', 'A5'],

  'dim': ['m3', 'd5'],
  'o': ['m3', 'd5'],

  'maj': ['M3', 'P5', 'M7'],
  'dom': ['M3', 'P5', 'm7'],
  'ø': ['m3', 'd5', 'm7'],

  '5': ['P5'],

  '6/9': ['M3', 'P5', 'M6', 'M9']
};

module.exports = function(symbol) {
  var c, parsing = 'quality', additionals = [], name, chordLength = 2
  var notes = ['P1', 'M3', 'P5', 'm7', 'M9', 'P11', 'M13'];
  var explicitMajor = false;

  function setChord(name) {
    var intervals = SYMBOLS[name];
    for (var i = 0, len = intervals.length; i < len; i++) {
      notes[i + 1] = intervals[i];
    }

    chordLength = intervals.length;
  }

  // Remove whitespace, commas and parentheses
  symbol = symbol.replace(/[,\s\(\)]/g, '');
  for (var i = 0, len = symbol.length; i < len; i++) {
    if (!(c = symbol[i]))
      return;

    if (parsing === 'quality') {
      var sub3 = (i + 2) < len ? symbol.substr(i, 3).toLowerCase() : null;
      var sub2 = (i + 1) < len ? symbol.substr(i, 2).toLowerCase() : null;
      if (sub3 in SYMBOLS)
        name = sub3;
      else if (sub2 in SYMBOLS)
        name = sub2;
      else if (c in SYMBOLS)
        name = c;
      else
        name = '';

      if (name)
        setChord(name);

      if (name === 'M' || name === 'ma' || name === 'maj')
        explicitMajor = true;


      i += name.length - 1;
      parsing = 'extension';
    } else if (parsing === 'extension') {
      c = (c === '1' && symbol[i + 1]) ? +symbol.substr(i, 2) : +c;

      if (!isNaN(c) && c !== 6) {
        chordLength = (c - 1) / 2;

        if (chordLength !== Math.round(chordLength))
          return new Error('Invalid interval extension: ' + c.toString(10));

        if (name === 'o' || name === 'dim')
          notes[3] = 'd7';
        else if (explicitMajor)
          notes[3] = 'M7';

        i += c >= 10 ? 1 : 0;
      } else if (c === 6) {
        notes[3] = 'M6';
        chordLength = Math.max(3, chordLength);
      } else
        i -= 1;

      parsing = 'alterations';
    } else if (parsing === 'alterations') {
      var alterations = symbol.substr(i).split(/(#|b|add|maj|sus|M)/i),
          next, flat = false, sharp = false;

      if (alterations.length === 1)
        return new Error('Invalid alteration');
      else if (alterations[0].length !== 0)
        return new Error('Invalid token: \'' + alterations[0] + '\'');

      var ignore = false;
      alterations.forEach(function(alt, i, arr) {
        if (ignore || !alt.length)
          return ignore = false;

        var next = arr[i + 1], lower = alt.toLowerCase();
        if (alt === 'M' || lower === 'maj') {
          if (next === '7')
            ignore = true;

          chordLength = Math.max(3, chordLength);
          notes[3] = 'M7';
        } else if (lower === 'sus') {
          var type = 'P4';
          if (next === '2' || next === '4') {
            ignore = true;

            if (next === '2')
              type = 'M2';
          }

          notes[1] = type; // Replace third with M2 or P4
        } else if (lower === 'add') {
          if (next === '9')
            additionals.push('M9');
          else if (next === '11')
            additionals.push('P11');
          else if (next === '13')
            additionals.push('M13');

          ignore = true
        } else if (lower === 'b') {
          flat = true;
        } else if (lower === '#') {
          sharp = true;
        } else {
          var token = +alt, quality, intPos;
          if (isNaN(token) || String(token).length !== alt.length)
            return new Error('Invalid token: \'' + alt + '\'');

          if (token === 6) {
            if (sharp)
              notes[3] = 'A6';
            else if (flat)
              notes[3] = 'm6';
            else
              notes[3] = 'M6';

            chordLength = Math.max(3, chordLength);
            return;
          }

          // Calculate the position in the 'note' array
          intPos = (token - 1) / 2;
          if (chordLength < intPos)
            chordLength = intPos;

          if (token < 5 || token === 7 || intPos !== Math.round(intPos))
            return new Error('Invalid interval alteration: ' + token);

          quality = notes[intPos][0];

          // Alterate the quality of the interval according the accidentals
          if (sharp) {
            if (quality === 'd')
              quality = 'm';
            else if (quality === 'm')
              quality = 'M';
            else if (quality === 'M' || quality === 'P')
              quality = 'A';
          } else if (flat) {
            if (quality === 'A')
              quality = 'M';
            else if (quality === 'M')
              quality = 'm';
            else if (quality === 'm' || quality === 'P')
              quality = 'd';
          }

          sharp = flat = false;
          notes[intPos] = quality + token;
        }
      });
      parsing = 'ended';
    } else if (parsing === 'ended') {
      break;
    }
  }

  return notes.slice(0, chordLength + 1).concat(additionals);
}

},{}],9:[function(require,module,exports){
'use strict'

var TimeMeter = require('time-meter')
var noteDuration = require('note-duration')

// Use ticks internally (to prevent 1/3 + 1/3 + 1/3 == 0.99 )
var TICKS = 96 * 4

/*
 * parseMeasures
 *
 * @params {String} measures - the string measures to be parsed
 * @params {String} time - the time signature (4/4 by default)
 * @returns {Array} - an array of obects with value and expectedDur
 */
module.exports = function (measures, time, options) {
  if (Array.isArray(measures)) {
    return measures
  } else if (typeof measures !== 'string') {
    throw Error('String or Array expected in melody-parser')
  }

  if (typeof time !== 'string') {
    options = time
    time = null
  }

  var opts = {}
  options = options || {}
  opts.durationParser = options.durationParser || parseDuration
  opts.forceDurations = options.forceDurations || /[|()]/.test(measures)
  opts.extendSymbol = options.extendSymbol || '_'

  time = time || '4/4'
  var meter = TimeMeter(time)
  return parseMeasures(meter, measures, opts)
}

function parseMeasures (meter, measures, options) {
  var events = []
  var position = 0
  var expectedDur = options.forceDurations ? meter.measure * TICKS : -1

  splitMeasures(measures).forEach(function (measure) {
    var list = parenthesize(tokenize(measure), [])
    position = parseList(events, list, position, expectedDur, options)
  })

  events.forEach(function (event) {
    event.duration = event.duration / TICKS
    event.position = event.position / TICKS
  })
  return events
}

function parseList (events, list, position, total, options) {
  var expectedDur = total / list.length
  list.forEach(function (item) {
    if (Array.isArray(item)) {
      position = parseList(events, item, position, expectedDur, options)
    } else {
      position = parseItem(events, item, position, expectedDur, options)
    }
  })
  return position
}

function parseItem (events, item, position, expectedDur, options) {
  var parsed = options.durationParser(item, expectedDur / TICKS)
  var event = parsed ?
    { value: parsed[0], position: position, duration: parsed[1] * TICKS} :
    { value: item, position: position, duration: expectedDur}

  // var rounded = Math.floor(event.position * 10 + 0.001)
  // if (Math.floor(event.position * 10) !== rounded) {
  //   event.position = rounded / 10
  // }

  if (event.value === options.extendSymbol) {
    var last = events[events.length - 1]
    last.duration += event.duration
  } else {
    events.push(event)
  }
  return event.position + event.duration
}

function parseDuration (item, expectedDur) {
  var split = item.split('/')
  var dur = calcDuration(split[1])
  if (dur) return [split[0], dur]
  else if (expectedDur > 0) return [item, expectedDur]
  else return [item, 0.25]
}

function calcDuration (string) {
  if (!string) return null
  var duration = string.split('+').map(function (durString) {
    return noteDuration(durString)
  }).reduce(function (a, b) {
    return a + b
  }, 0)
  return (duration === +duration) ? duration : null
}

function splitMeasures (repr) {
  return repr
    .replace(/\s+\||\|\s+/, '|') // spaces between |
    .replace(/^\||\|\s*$/g, '') // first and last |
    .split('|')
}

/*
 * The following code is copied from https://github.com/maryrosecook/littlelisp
 * See: http://maryrosecook.com/blog/post/little-lisp-interpreter
 * Thanks Mary Rose Cook!
 */
var parenthesize = function (input, list) {
  var token = input.shift()
  if (token === undefined) {
    return list
  } else if (token === '(') {
    list.push(parenthesize(input, []))
    return parenthesize(input, list)
  } else if (token === ')') {
    return list
  } else {
    return parenthesize(input, list.concat(token))
  }
}

var tokenize = function (input) {
  return input
    .replace(/[\(]/g, ' ( ')
    .replace(/[\)]/g, ' ) ')
    .replace(/\,/g, ' ')
    .trim().split(/\s+/)
}

},{"note-duration":10,"time-meter":14}],10:[function(require,module,exports){
'use strict'

var names = ['long', 'double', 'whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirty-second']
var values = [4, 2, 1, 1 / 2, 1 / 4, 1 / 8, 1 / 16, 1 / 32]

var namesToValues = {}
for (var i = 0; i < values.length; i++) {
  var name = names[i]
  var value = values[i]
  var short = name[0]
  var num = '' + (1 / value)
  namesToValues[name] = value
  namesToValues[short] = namesToValues[num] = value
  namesToValues[short + '.'] = namesToValues[num + '.'] = value + value / 2
  namesToValues[short + '..'] = namesToValues[num + '..'] = value + value / 2 + value / 4
  namesToValues[short + 't'] = namesToValues[num + 't'] = (value + value) / 3
}

var valuesToNames = {}
names.forEach(function (name, index) {
  var value = values[index]
  valuesToNames['' + value] = name[0]
  valuesToNames['' + (value + value / 2)] = name[0] + '.'
  valuesToNames['' + (value + value / 2 + value / 4)] = name[0] + '..'
})

var duration = function (name) {
  return namesToValues['' + name]
}

duration.toString = function (value) {
  return valuesToNames['' + value]
}

module.exports = duration

},{}],11:[function(require,module,exports){
'use strict'

var Interval = require('interval-parser')
var parse = require('note-parser')

var Note = {}

Note.parse = function (note) {
  return parse.apply(null, arguments)
}

Note.semitones = function (a, b) {
  return parse(b).midi - parse(a).midi
}

/*
 * pitch.distance
 *
 * return intervals between notes
 */
Note.distance = function (root, notes) {
  root = parse(root)
  if (arguments.length === 1) {
    return function (note) {
      return interval(root, note)
    }
  } else if (Array.isArray(notes)) {
    return notes.map(function (i) {
      return interval(root, i)
    })
  } else {
    return interval(root, notes)
  }
}

Note.transpose = function (note, interval) {
  if (arguments.length === 1) {
    interval = note
    return function (note) {
      return transpose(note, interval)
    }
  } else if (Array.isArray(interval)) {
    return interval.map(function (i) {
      return transpose(note, i)
    })
  } else {
    return transpose(note, interval)
  }
}

var CHANGE = {
  'minor': ['d', 'm', 'M', 'A'],
  'perfect': ['d', 'P', 'A']
}
function interval (a, b) {
  a = parse(a)
  b = parse(b)
  var semitones = b.midi - a.midi
  var dir = semitones < 0 ? -1 : 1
  var pitchDistance = pitchDist(a, b) + dir
  if (dir < 0) pitchDistance -= 7

  var i = Interval('d' + pitchDistance)
  var octaves = semitones / 12 | 0
  if (octaves === -1) octaves = 0
  var difference = dir * (semitones - i.semitones - 12 * octaves)
  var dest = CHANGE[i.type][difference] + (pitchDistance + 7 * octaves)
  return dest
}

function pitchDist (a, b) {
  var first = PITCH_CLASSES.indexOf(parse(a).pc)
  var second = PITCH_CLASSES.indexOf(parse(b).pc, first)
  return second - first
}

var PITCH_CLASSES = 'cdefgabcdefgab'
var ACCIDENTALS = ['bb', 'b', '', '#', '##']
function transpose (note, interval) {
  note = parse(note, null, null)
  if (!note) return null;
  interval = Interval(interval)
  var pitchIndex = PITCH_CLASSES.indexOf(note.pc)
  var pc = PITCH_CLASSES[pitchIndex + interval.simple - 1]
  var dest = parse(pc + (note.oct + interval.octaves))
  var difference = interval.semitones - (dest.midi - note.midi)
  var reduced = difference % 12
  var octaves = (difference - reduced) / 12
  var accidentals = ACCIDENTALS[reduced + 2]
  return dest.pc + accidentals + (dest.oct + octaves)
}

module.exports = Note

},{"interval-parser":12,"note-parser":13}],12:[function(require,module,exports){
'use strict';
/*
 * parseInterval
 *
 * Parse a interval and returns an object with:
 * - name
 * - quality
 * - direction
 * - number
 * - simple
 * - type
 * - semitones
 * - octaves
 */
var INTERVAL = /^([dmPMA])(-{0,1})(\d{1,2})$/;
function parseInterval(interval) {
  var obj = null;
  if(isIntervalObj(interval)) {
    obj = prepare(interval);
  } else if (typeof(interval) == 'string') {
    var m = INTERVAL.exec(interval.trim());
    if(m) {
      obj = prepare({name: interval, quality: m[1],
        direction: m[2], number: m[3]});
    }
  }
  return validate(interval, obj);
}

function validate(name, obj) {
  if(obj == null) {
    throw Error("Interval not valid: " + name);
  }
  return obj;
}


function isIntervalObj(interval) {
  return typeof(interval.name) !== 'undefined'
    && typeof(interval.quality) !== 'undefined'
    && typeof(interval.direction) !== 'undefined'
    && typeof(interval.number) !== 'undefined';
}

function prepare(i) {
  i.number = +i.number;
  i.direction = i.direction === '' ? 1 : -1;
  i.octaves = i.octaves || octaves(i);
  i.simple = i.simple || simpleNumber(i);
  i.type = i.type || type(i);
  i.semitones = i.semitones || semitones(i);
  if(/A1|d1|d2/.test(i.name)) i.direction = -1;
  return i;
}

function simpleNumber(i) {
  if(i.number > 8) {
    var num = (i.number - 1) % 7 + 1;
    if (num == 1) num = 8;
    return num;
  } else {
    return i.number;
  }
}

function octaves(i) {
  if(i.number === 1) return 0;
  else return Math.floor((i.number - 2) / 7);
}

 var SEMITONES = {"d1": -1, "d2": 0, "d3": 2, "d4": 4, "d5": 6,
   "d6": 7, "d7": 9, "d8": 11}
 var EXTRA = {
   "minor": {"d": 0, "m": 1, "M": 2, "A": 3 },
   "perfect": {"d": 0, "P": 1, "A": 2 }
 };

function semitones(i) {
  var semi = SEMITONES["d" + i.simple];
  var extra = EXTRA[i.type][i.quality];
  var oct = i.octaves * 12;
  return i.direction * (semi + extra + oct);
}


function type(i) {
  var num = i.simple;
  if(num === 1 || num === 4 || num === 5 || num === 8) {
    return "perfect";
  } else {
    return "minor";
  }
}

if (typeof module === "object" && module.exports) module.exports = parseInterval;
else i.parseInterval = parseInterval;

},{}],13:[function(require,module,exports){
'use strict'

var NOTE = /^([a-gA-G])(#{0,2}|b{0,2})(-?[0-9]{1}|[+]{0,2}|[-]{0,2})$/
/*
 * parseNote
 *
 * @param {String} note - the note string to be parsed
 * @return {Object} a object with the following attributes:
 * - pc: pitchClass, the letter of the note, ALWAYS in lower case
 * - acc: the accidentals (or '' if no accidentals)
 * - oct: the octave as integer. By default is 4
 */
var parse = function (note, defaultOctave, defaultValue) {
  var parsed, match, octave

  // in scientific notation middleC is 4
  defaultOctave = defaultOctave || 4
  // test string against regex
  if (typeof note === 'string' && (match = NOTE.exec(note))) {
    // match[3] is the octave part
    if (match[3].length > 0 && !isNaN(match[3])) {
      octave = +match[3]
    } else if (match[3][0] === '+') {
      octave = defaultOctave + match[3].length
    } else if (match[3][0] === '-') {
      octave = defaultOctave - match[3].length
    } else {
      octave = defaultOctave
    }
    parsed = { pc: match[1].toLowerCase(),
      acc: match[2], oct: octave }
  } else if (typeof note.pc !== 'undefined'
    && typeof note.acc !== 'undefined'
    && typeof note.oct !== 'undefined') {
    parsed = note
  }

  if (parsed) {
    parsed.midi = parsed.midi || toMidi(parsed)
    parsed.freq = parsed.freq || midiToFrequency(parsed.midi)
    return parsed
  } else if (typeof (defaultValue) !== 'undefined') {
    return defaultValue
  } else {
    throw Error('Invalid note format: ' + note)
  }
}

parse.toString = function (obj) {
  return obj.pc + obj.acc + obj.oct
}

var SEMITONES = {c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
function toMidi (note) {
  var alter = note.acc.length
  if (note.acc[0] === 'b') alter = -1 * alter
  return SEMITONES[note.pc] + alter + 12 * (note.oct + 1)
}
function midiToFrequency (note) {
  return Math.pow(2, (note - 69) / 12) * 440
}

module.exports = parse

},{}],14:[function(require,module,exports){
'use strict';

module.exports = TimeMeter;

function TimeMeter(meter) {
  if(!(this instanceof TimeMeter)) return new TimeMeter(meter);
  meter = meter.split('/');
  this.beats = +meter[0];
  this.subdivision = +meter[1]
  this.measure = this.beats / this.subdivision;
}

TimeMeter.prototype.toString = function () {
  return "" + this.beats + "/" + this.subdivision;
};

},{}],15:[function(require,module,exports){
'use strict'

var parseMusic = require('music-parser')
var identity = function (e) { return e }

module.exports = function () {
  /*
   * Score
   *
   * @param {String | Array } source - the sequence source
   * @param {String} time [optional] - the time signature ("4/4" by default)
   * @param {Function} - the transformation function
   */
  function Score (source, time, transform) {
    if (!(this instanceof Score)) return new Score(source, time, transform)

    var hasTimeParam = (typeof (time) === 'string')
    this.time = hasTimeParam ? time : '4/4'

    if (source instanceof Score) {
      this.sequence = source.sequence
      this.time = source.time
    } else if (typeof source === 'string') {
      this.sequence = parseMusic(source, this.time)
    } else if (Array.isArray(source)) {
      // it they are not events, create new events
      this.sequence = source.map(function (e) {
        return isEvent(e) ? e : Score.event(e)
      })
    } else {
      throw Error('Unkown source format: ' + source)
    }
    transform = hasTimeParam ? transform : time
    transform = transform || identity
    var applyFn = (typeof (transform) === 'function') ? applyFunction : applyObj
    applyFn(this, transform)
  }
  /*
   * applyFunction(private)
   * map -> flatten - > compact -> sort
   */
  function applyFunction (score, transform) {
    score.sequence = [].concat.apply([], score.sequence.map(transform))
      .filter(function (e) {
        return e != null
      })
      .sort(function (a, b) {
        return a.position - b.position
      })
  }
  function applyObj (score, obj) {
    var result = score
    for (var name in obj) {
      if (!score[name]) {
        throw Error("Sequence doesn't have '" + name + "' method. Maybe forgot a plugin?")
      } else {
        result = result[name].call(result, obj[name])
      }
    }
    score.sequence = result.sequence
  }

  function isEvent (e) {
    return typeof (e.value) !== 'undefined' &&
      typeof (e.position) !== 'undefined' &&
      typeof (e.duration) !== 'undefined'
  }

  function merge (dest, obj) {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        dest[key] = obj[key]
      }
    }
  }

  /*
   * Score.event
   *
   * Clone or create events and merge parameters
   */
  Score.event = function (e, obj) {
    var evt = { value: e, position: 0, duration: 0 }
    if (e && typeof (e.value) !== 'undefined') merge(evt, e)
    if (obj) merge(evt, obj)
    return evt
  }

  Score.merge = function () {
    var result = []
    for (var i = 0, total = arguments.length; i < total; i++) {
      result = result.concat(arguments[i].sequence)
    }
    return new Score(result)
  }

  Score.concat = function () {
    var result = [], s, position = 0
    for (var i = 0, total = arguments.length; i < total; i++) {
      s = Score(arguments[i], function (event) {
        return Score.event(event, { position: event.position + position})
      })
      result = result.concat(s.sequence)
      position += s.duration()
    }
    return new Score(result)
  }

  Score.prototype.clone = function (transform) {
    return new Score(this, transform)
  }

  Score.prototype.set = function (properties) {
    return this.clone(function (event) {
      return Score.event(event, properties)
    })
  }

  Score.fn = Score.prototype
  Score.use = function (plugin) {
    plugin(Score)
  }

  return Score
}

},{"music-parser":9}],16:[function(require,module,exports){
'use strict'

var Score = require('./score.js')()
Score.use(require('./core/time.js'))
Score.use(require('./core/select.js'))
Score.use(require('./core/notes.js'))
Score.use(require('./core/chords.js'))
Score.use(require('./core/builder.js'))

if (typeof module === 'object' && module.exports) module.exports = Score
if (typeof window !== 'undefined') window.Score = Score

},{"./core/builder.js":1,"./core/chords.js":2,"./core/notes.js":3,"./core/select.js":4,"./core/time.js":5,"./score.js":15}]},{},[16]);
