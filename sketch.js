/*jshint esversion: 8 */

// thanks:
// https://github.com/michaelruppe/art/blob/master/solar-system-p5/sketch.js

var gui
var guiVisible = true

/* visuals */
var canvas
var canvasWidth = window.innerWidth
var canvasHeight = window.innerHeight
var systemWidth = canvasWidth * 2
var systemHeight = canvasHeight * 2
var clearingAlpha = 5
var clearingAlphaMin = 0
var clearingAlphaMax = 255
var clearingAlphaStep = 5
var shouldWipeClear = false
var shouldStutter = false
var stopStutterAt
var shouldDrawPlanets = false

var gravityConstant = 2
var gravityConstantMin = 0
var gravityConstantMax = 10
var gravityConstantStep = 0.1
  
var velocityStdDev = 1.5
var velocityStdDevMin = 0.1
var velocityStdDevMax = 10
var velocityStdDevStep = 0.1

var sun
var sunDisplace = 40
var planets
var queuedPlanets = []
var derivedBodies
var trailLength = 50
var trailLengthMin = 1
var trailLengthMax = 300
var trailLengthStep = 1
var trailWidthScaleFactor = 10
var trailWidthScaleFactorMin = 1
var trailWidthScaleFactorMax = 100
var trailWidthScaleFactorStep = 1
var maxTrailWidth = 7
var maxTrailWidthMin = 1
var maxTrailWidthMax = 100
var maxTrailWidthStep = 1

/* audio */
var audioIn
var audioDevices
var audioDeviceLabels = ['none']
var audioProcessingReady = false
var audioPeakThreshold = 0.2
var peakCount = 0
var fft, peakDetect
var audioEnergy = 0
var bassEnergy = 0
var midEnergy = 0
var trebleEnergy = 0

function setup() {
  canvas = createCanvas(canvasWidth, canvasHeight)
  background(0)
  
  gui = createGui('northern lights')
  gui.setPosition(width+20, 0)
  gui.prototype.addRange('Planets', 0, 200, '?', 1)
  gui.addGlobals('gravityConstant', 'velocityStdDev', 'clearingAlpha')
  gui.addGlobals('trailLength', 'trailWidthScaleFactor', 'maxTrailWidth')
  
  sun = new Body(100, createVector(0,0), createVector(0,0), true)
  planets = []
  derivedBodies = []
  
  links = []
  canvasCenter = createVector(width/2, height/2)
}

function draw() {
  if(audioProcessingReady){
    fft.analyze()
    peakDetect.update(fft)
    
    // Energies are 0-255
    bassEnergy = (fft.getEnergy('bass') + fft.getEnergy('lowMid')) / 2
    midEnergy = fft.getEnergy('mid')
    trebleEnergy = (fft.getEnergy('highMid') + fft.getEnergy('treble')) / 2
    audioEnergy = (bassEnergy + midEnergy + trebleEnergy) / 3
  
    if(guiVisible){
      gui.prototype.setValue('Audio Energy', audioEnergy)
      gui.prototype.setValue('Bass', bassEnergy)
      gui.prototype.setValue('Mids', midEnergy)
      gui.prototype.setValue('Treble', trebleEnergy)
    }
  }
  
  // upkeep - we only insert items at top of draw()
  // console.log('flushing queued planets: ' + queuedPlanets.length)
  for(let i = queuedPlanets.length - 1; i >= 0; i--){
    planets.push(new Body(queuedPlanets[i][0], 
                         queuedPlanets[i][1],
                         queuedPlanets[i][2],))
    derivedBodies.push({points: []})
  }
  queuedPlanets = []
  thisFrameTrailLength = trailLength
  
  gui.prototype.setValue('Planets', planets.length)
  
  console.log(peakCount)
  if(peakCount > 0 && peakCount % 10 == 0){
    shouldStutter = true
    console.log('stuttering')
    stopStutterAt = peakCount + 4
  } 
  
  if(peakCount == stopStutterAt){
    shouldStutter = false
    console.log('not stuttering')
  }
  
  if(shouldStutter){
    if(frameCount % floor(randomGaussian(10, 5) + 2) == 0){
      shouldWipeClear = true
    }
  }
  
  if(!shouldWipeClear){
    background(0, 0, 0, clearingAlpha)
  } else {
    thisFrameTrailLength = 0
    background(0)
    shouldWipeClear = false
  }
  
  translate(canvasCenter.x, canvasCenter.y)
  
  // update & draw sun
  sun.updateSun(bassEnergy)
  sun.draw()
  
  for(let i = planets.length - 1; i >= 0; i--){
    if(planets[i].shouldDelete){
      planets.splice(i,1)
      derivedBodies.splice(i, 1)
      continue
    }
      
    sun.attract(planets[i])
    planets[i].move()
      
    if(shouldDrawPlanets){
      if(!shouldStutter){
        planets[i].draw()  
      } else {
        if(i % 10 == 0){
          const tempOpacity = planets[i].opacity
          planets[i].opacity = random(150, 250)
          planets[i].draw()
          planets[i].opacity = tempOpacity
        }
      }
    }
  }
  
  if(planets.length >= 2){
    var derivedBodyX, derivedBodyY, distance, normalizedDistance, pointStrokeWeight
    // update derivedBodies
    for(let i = planets.length - 1; i >= 0; i--){
      let planetA, planetB
      if( i > 0 ){
        planetA = planets[i].position
        planetB = planets[i-1].position
      } else if( i == 0){
        planetA = planets[i].position
        planetB = planets[planets.length-1].position
      }
      
      derivedBodyX = (planetB.x + planetA.x) / 2
      derivedBodyY = (planetB.y + planetA.y) / 2
      
      if(derivedBodies[i].points.length > thisFrameTrailLength){
        derivedBodies[i].points.splice(0, derivedBodies[i].points.length - thisFrameTrailLength)
      }
      derivedBodies[i].points.push([derivedBodyX, derivedBodyY, random(0, 10)])
    }
  
    // draw derivedBodies
    push()
    noFill()
    stroke(255)
    let firstPoint, secondPoint, curveLength
    for( let i = derivedBodies.length - 1; i >= 0; i--){
      thisBodyPoints = derivedBodies[i].points
      firstPoint = thisBodyPoints[0]
      secondPoint = thisBodyPoints[1] || thisBodyPoints[0]
      curveLength = sqrt(
        pow(secondPoint[0] - firstPoint[0], 2) +
        pow(secondPoint[1] - firstPoint[1], 2)
      )
      // console.log(curveLength)
      strokeWeight(max(1, maxTrailWidth - curveLength*trailWidthScaleFactor))
      
      beginShape()
      for(let j = derivedBodies[i].points.length - 1; j >= 0; j--){  
        if(j == derivedBodies[i].points.length-1 ||
           j == 0){
          // draw first and last points twice for curve rendering
          curveVertex(
            derivedBodies[i].points[j][0],
            derivedBodies[i].points[j][1]
          )
        }
        curveVertex(
          derivedBodies[i].points[j][0],
          derivedBodies[i].points[j][1]
        )
      }
      endShape()
    }
    pop()
  }
    
    
  shouldDrawPlanets = false
}

async function mousePressed(){
  initAudioInput()
  fullscreen(true)
  
  const planetBurstCoords = createVector(mouseX, mouseY) 
  createPlanetBurstAtLocation(planetBurstCoords)
  
  await sleep(2000)
  createPlanetBurstAtLocation(createVector(random(0, width), random(0, height)))
  createPlanetBurstAtLocation(createVector(random(0, width), random(0, height)))
  createPlanetBurstAtLocation(createVector(random(0, width), random(0, height)))
  createPlanetBurstAtLocation(createVector(random(0, width), random(0, height)))
  
  // const location = createVector(mouseX, mouseY)
  // createVector(random(0, width), random(0, height))
  //   const location = createVector(mouseX, mouseY)
  //   createPlanetAtLocation(location)
}
  
function createPlanetBurstAtLocation(location){
  // spray some new planets
  const planetBurstCount = floor(randomGaussian(7, 2))
  for(let i = 0; i < planetBurstCount; i++){
    const safeLocation = location.copy()
    createPlanetAtLocation(safeLocation)
  }
}
  
function createPlanetAtLocation(location){
  const adjustedLocation = location.sub(canvasCenter) 
  
  velocity = location.copy()
  velocity.rotate(HALF_PI)
  velocity.normalize()
  velocity.mult(sqrt((gravityConstant * sun.mass)/adjustedLocation.mag()))
  
  velocity.mult(abs(randomGaussian(1, velocityStdDev)))
  
  queuedPlanets.push([1, adjustedLocation, velocity])
}

class Body {
  constructor(mass, position, velocity, isSun = false){
    this.mass = mass
    this.baseMass = mass
    this.position = position
    this.velocity = velocity
    this.opacity = 255
    this.radius = 10
    
    this.isSun = isSun
    if(this.isSun){
      this.radius = this.radiusFromMass(this.mass)
    } else {
      this.opacity = random(10, 100)
      this.radius = random(10, 150)
    }
    
    this.shouldDelete = false
    
    this.center = createVector(0,0)
  }
  
  attract(child){
    const orbitRadius = dist(
      this.position.x, this.position.y,
      child.position.x, child.position.y
    )
   
    let f = (this.position.copy()).sub(child.position)
    f.setMag( 
      (gravityConstant * this.mass * child.mass) / 
      (orbitRadius * orbitRadius)
    )
    
    child.applyForce(f)
  }
  
  applyForce(f){
    this.velocity.x += f.x / this.mass
    this.velocity.y += f.y / this.mass
  }
  
  move(){
    this.position.x += this.velocity.x
    this.position.y += this.velocity.y
    
    if(abs(this.position.x) > systemWidth ||
      abs(this.position.y) > systemHeight){
      // console.log('killing a planet')
      this.shouldDelete = true
    }
    
  }
  
  updateSun(value){
    this.mass = this.baseMass + value
    this.radius = this.radiusFromMass(this.mass)
    
    this.opacity = value - 25
    
    if(this.position != this.center){
      const toCenter = this.center.sub(this.position)
      const step = toCenter.mult(0.2)
      this.position.x += step.x
      this.position.y += step.y
    }          
  }
  
  radiusFromMass(mass){
    return pow(this.mass, 2)/750
  }
  
  draw(){
    push()
    noStroke()
    fill(255, 255, 255, this.opacity)
    circle(this.position.x, this.position.y, this.radius)
    pop()
  }
}

async function initAudioInput(){
  if(audioIn == null){
    userStartAudio()
    audioIn = new p5.AudioIn(onError)
    
    audioIn.start()
    
    await(sleep(2000))
    
    console.log('audio enabled: ' + audioIn.enabled)
    
    audioIn.connect()
    
    try {
      audioDevices = await audioIn.getSources()
    } catch(error) {
      throw error
    }
    
    console.log(audioDevices)
    audioDeviceLabels = audioDevices.map( device => device.label )
    console.log(audioDeviceLabels)
    gui.prototype.addDropDown("Audio Source", audioDeviceLabels, onChangeAudioSource)
    
    initAudioProcessing()
  }
}

function initAudioProcessing(){
  fft = new p5.FFT()
  audioIn.connect(fft)
  
  gui.prototype.addRange('Beat detection threshold', 0, 1, audioPeakThreshold, 0.05, onBeatDetectionThresholdChange)
  peakDetect = new p5.PeakDetect()
  peakDetect.threshold = audioPeakThreshold
  peakDetect.onPeak(onSoundBeat);
  audioProcessingReady = true
  
  gui.prototype.addProgressBar("Audio Energy", 255, audioEnergy)
  gui.prototype.addProgressBar("Bass", 255, bassEnergy)
  gui.prototype.addProgressBar("Mids", 255, midEnergy)
  gui.prototype.addProgressBar("Treble", 255, trebleEnergy)
}

function onChangeAudioSource(){
  console.log('changing audio source')
  audioIn.stop()
  const newAudioDeviceIndex = audioDevices.findIndex( (device, index) => device.label == audioDeviceLabels)
  audioIn.setSource( newAudioDeviceIndex ) 
  audioIn.start()
  
}

function onBeatDetectionThresholdChange(value){
  peakDetect.threshold = value
}

function onSoundBeat(){
  // console.log("beat")
  peakCount++
  
  const randomLocation = createVector(random(0, width), random(0, height))
  createPlanetBurstAtLocation(randomLocation)
  
  // bounce the sun
  const v = p5.Vector.fromAngle(radians(random(0,359)), randomGaussian(sunDisplace, 2))
  sun.position.x += v.x
  sun.position.y += v.y
  
  shouldDrawPlanets = true
}

// check for keyboard events
function keyPressed() {
  switch(key) {
    // type 'p' to hide / show the GUI
    case 'p':
      guiVisible = !guiVisible;
      if(guiVisible) {
        gui.show()
      } else {
        gui.hide()
      }
      break
  }
}

function onError(error){
  throw error
}

function sleep(millisecondsDuration)
{
  return new Promise((resolve) => {
    setTimeout(resolve, millisecondsDuration);
  })
}
  
window.onresize = function() {
  // assigns new values for width and height variables
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;  
  canvas.size(canvasWidth,canvasHeight);
}

