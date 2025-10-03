class Task {
    constructor(x, y, complexity, id) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.targetX = x;
        this.targetY = y;
        this.complexity = complexity; // seconds to complete
        this.remainingTime = complexity;
        this.radius = Math.min(8 + complexity * 2, 20);
        this.speed = 2;
        this.state = 'traveling'; // traveling, queued, processing, completed
        this.assignedEngineer = null;
        this.queueStartTime = null;
        this.processingStartTime = null;
        this.completionTime = null;
        this.wasPreempted = false; // Track if task was interrupted
        
        // Simulated time tracking for accurate statistics
        this.simulatedQueueStartTime = null;
        this.simulatedCompletionTime = null;
        
        // Severity will be set by the simulation based on configured probabilities
        // For now, set a default that will be overridden
        this.severity = 4; // Default to lowest severity, will be overridden
        
        // Training flag
        this.isTraining = false;
        
        // Visual properties
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.trailPoints = [];
        
        // Color based on complexity
        this.color = this.getComplexityColor();
    }

    getComplexityColor() {
        const maxComplexityEl = document.getElementById('maxComplexity');
        const minComplexityEl = document.getElementById('minComplexity');
        
        if (!maxComplexityEl || !minComplexityEl) {
            // Fallback colors if DOM elements aren't available yet
            if (this.complexity <= 3) return '#ff6b6b';
            if (this.complexity <= 6) return '#ffa500';
            return '#ff1744';
        }
        
        const maxComplexity = parseInt(maxComplexityEl.value);
        const minComplexity = parseInt(minComplexityEl.value);
        const range = maxComplexity - minComplexity;
        const normalized = range > 0 ? (this.complexity - minComplexity) / range : 0;
        
        if (normalized < 0.33) {
            return '#ff6b6b'; // Light red for low complexity
        } else if (normalized < 0.66) {
            return '#ffa500'; // Orange for medium complexity
        } else {
            return '#ff1744'; // Dark red for high complexity
        }
    }

    update(deltaTime) {
        // Update trail
        this.trailPoints.push({ x: this.x, y: this.y, time: Date.now() });
        this.trailPoints = this.trailPoints.filter(point => Date.now() - point.time < 500);

        if (this.state === 'traveling') {
            // Move towards target
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 2) {
                // Get time speed from simulation
                const simulation = window.simulation;
                const timeSpeed = simulation ? simulation.timeSpeed : 1.0;
                
                // 2x faster travel speed, affected by time speed and frame-independent
                const travelSpeed = this.speed * 2 * timeSpeed * (deltaTime / 16.67); // Normalize to ~60fps
                this.x += (dx / distance) * travelSpeed;
                this.y += (dy / distance) * travelSpeed;
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                
                if (this.assignedEngineer) {
                    // Task has reached engineer - notify engineer to receive it
                    this.assignedEngineer.receiveTask(this);
                } else {
                    this.state = 'queued';
                    this.queueStartTime = Date.now();
                }
            }
        } else if (this.state === 'processing') {
            // Task processing is now handled by the Engineer's update method
            // Just update visual effects here
        }

        this.pulsePhase += deltaTime * 0.005;
    }

    draw(ctx) {
        // Draw trail
        if (this.trailPoints.length > 1) {
            ctx.strokeStyle = this.color + '40';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < this.trailPoints.length - 1; i++) {
                const alpha = i / this.trailPoints.length;
                ctx.globalAlpha = alpha * 0.3;
                if (i === 0) {
                    ctx.moveTo(this.trailPoints[i].x, this.trailPoints[i].y);
                } else {
                    ctx.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
                }
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Draw main task
        const pulseSize = this.state === 'processing' ? 
            Math.sin(this.pulsePhase) * 3 : 0;
        
        // Make completed tasks slightly transparent
        ctx.globalAlpha = this.state === 'completed' ? 0.6 : 1.0;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1.0;

        // Draw inner circle for processing tasks
        if (this.state === 'processing') {
            const progress = 1 - (this.remainingTime / this.complexity);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, (this.radius - 4) * progress, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw severity indicator
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`S${this.severity}`, this.x, this.y + 4);
    }
}

class Engineer {
    constructor(x, y, id, name) {
        this.id = id;
        this.name = name;
        this.x = x;
        this.y = y;
        this.radius = 25;
        this.speed = 1.0; // processing speed multiplier
        this.currentTask = null;
        this.pendingQueue = []; // Tasks ready to be processed (at engineer location)
        this.incomingTasks = []; // Tasks assigned but still traveling to engineer
        this.completedQueue = []; // Tasks that have been completed
        this.isSelected = false;
        
        // Visual properties
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.workParticles = [];
    }

    assignTask(task) {
        task.assignedEngineer = this;
        
        // Task goes to incoming queue first (still traveling)
        this.incomingTasks.push(task);
        task.targetX = this.x;
        task.targetY = this.y;
        task.state = 'traveling';
        
        return true;
    }

    // Called when a task reaches the engineer (completes travel)
    receiveTask(task) {
        // Remove from incoming and add to pending
        const index = this.incomingTasks.indexOf(task);
        if (index > -1) {
            this.incomingTasks.splice(index, 1);
        }
        
        this.pendingQueue.push(task);
        task.state = 'queued';
        task.x = this.x;
        task.y = this.y;
        
        // Set queue start time for statistics (if not already set)
        if (!task.queueStartTime) {
            task.queueStartTime = Date.now();
            // Also set simulated time for accurate statistics
            const simulation = window.simulation;
            if (simulation) {
                task.simulatedQueueStartTime = simulation.currentSimulationTime;
            }
        }
        
        // Sort pending queue by severity (lower severity number = higher urgency first)
        this.pendingQueue.sort((a, b) => a.severity - b.severity);
        
        // Check if we need to preempt current task (lower severity number = higher urgency)
        if (this.currentTask && task.severity < this.currentTask.severity) {
            // Preempt current task - save progress and put it back in queue
            this.preemptCurrentTask();
            this.startNextTask();
        } else if (!this.currentTask) {
            // No current task, start processing immediately
            this.startNextTask();
        }
        
        // Update positions of pending tasks
        this.updatePendingQueuePositions();
    }

    preemptCurrentTask() {
        if (this.currentTask) {
            // Mark task as preempted and reset state to queued
            this.currentTask.state = 'queued';
            this.currentTask.wasPreempted = true;
            
            // Put back in pending queue (progress is preserved in remainingTime)
            this.pendingQueue.push(this.currentTask);
            
            // Sort pending queue by severity (preempted task will be repositioned)
            this.pendingQueue.sort((a, b) => a.severity - b.severity);
            
            // Update positions
            this.updatePendingQueuePositions();
            
            this.currentTask = null;
        }
    }

    updatePendingQueuePositions() {
        // Only position the next task to be processed, others stay in spawn area
        if (this.pendingQueue.length > 0 && !this.currentTask) {
            this.pendingQueue[0].targetX = this.x + 40;
            this.pendingQueue[0].targetY = this.y;
        }
    }

    updateCompletedQueuePositions() {
        // Completed tasks are no longer drawn on canvas
        // They exist only in the queue for popup display
    }

    startNextTask() {
        if (this.pendingQueue.length > 0 && !this.currentTask) {
            this.currentTask = this.pendingQueue.shift();
            this.currentTask.targetX = this.x;
            this.currentTask.targetY = this.y;
            this.currentTask.state = 'processing'; // Task is ready to process immediately
            this.currentTask.processingStartTime = Date.now();
            
            console.log(`Engineer ${this.name} started processing task ${this.currentTask.id} (Severity ${this.currentTask.severity})`);
            
            // Update positions of remaining tasks in pending queue
            this.updatePendingQueuePositions();
        }
    }

    completeTask() {
        if (this.currentTask) {
            // Set task as completed
            this.currentTask.state = 'completed';
            this.currentTask.remainingTime = 0;
            this.currentTask.completionTime = Date.now();
            
            // Set simulated completion time for accurate statistics
            const simulation = window.simulation;
            if (simulation) {
                this.currentTask.simulatedCompletionTime = simulation.currentSimulationTime;
            }
            
            // Check if this is a training task
            if (this.currentTask.isTraining) {
                // Increase engineer performance by 0.1x
                this.speed += 0.1;
                console.log(`Engineer ${this.name} completed training! New speed: ${this.speed.toFixed(1)}x`);
                
                // Update UI if this engineer is selected
                if (simulation && simulation.selectedEngineer === this) {
                    document.getElementById('engineerSpeed').value = this.speed;
                    document.getElementById('engineerSpeedValue').textContent = this.speed.toFixed(1) + 'x';
                }
                if (simulation) {
                    simulation.updateEngineerList();
                }
            } else {
                // Only add non-training tasks to completed queue for statistics
                this.completedQueue.push(this.currentTask);
            }
            
            // Update positions of all completed tasks
            this.updateCompletedQueuePositions();
            
            this.currentTask = null;
            
            // Add completion particle effect
            for (let i = 0; i < 10; i++) {
                this.workParticles.push({
                    x: this.x + (Math.random() - 0.5) * 20,
                    y: this.y + (Math.random() - 0.5) * 20,
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4,
                    life: 1.0,
                    maxLife: 1.0
                });
            }
            
            // Start next task
            this.startNextTask();
        }
    }

    isAvailable() {
        return true; // Engineers always accept tasks (they have personal queues)
    }

    getPendingCount() {
        return this.pendingQueue.length + (this.currentTask ? 1 : 0);
    }

    getIncomingCount() {
        return this.incomingTasks.length;
    }

    getCompletedCount() {
        return this.completedQueue.length;
    }

    getTotalQueueLength() {
        return this.getPendingCount() + this.getIncomingCount();
    }

    getQueueLength() {
        return this.getTotalQueueLength(); // For backward compatibility with distribution logic
    }

    isIdle() {
        return this.currentTask === null;
    }

    getTasksBySeverity() {
        const severities = { 1: 0, 2: 0, 3: 0, 4: 0 };
        
        // Count current task
        if (this.currentTask) {
            severities[this.currentTask.severity]++;
        }
        
        // Count pending tasks
        this.pendingQueue.forEach(task => {
            severities[task.severity]++;
        });
        
        return severities;
    }

    update(deltaTime) {
        this.pulsePhase += deltaTime * 0.003;
        
        // Update work particles
        this.workParticles = this.workParticles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= deltaTime / 1000;
            return particle.life > 0;
        });

        // Check if it's working hours
        const simulation = window.simulation;
        if (!simulation) return;
        
        const timeSpeed = simulation.timeSpeed;
        const isWorkingHours = simulation.isWorkingHours();
        
        // Only process tasks during working hours
        if (isWorkingHours && this.currentTask && this.currentTask.state === 'processing') {
            this.currentTask.remainingTime -= (deltaTime / 1000) * this.speed * timeSpeed;
            
            // Check if task is completed
            if (this.currentTask.remainingTime <= 0) {
                this.completeTask();
            }
        } else if (this.currentTask && !isWorkingHours) {
            // During non-working hours, pause processing but don't complete tasks
            // Tasks will resume when working hours start again
        }
        
        // Start next task if none is being processed and it's working hours
        if (!this.currentTask && this.pendingQueue.length > 0 && isWorkingHours) {
            this.startNextTask();
        }
    }

    draw(ctx) {
        const isWorking = this.currentTask !== null;
        const pulseSize = isWorking ? Math.sin(this.pulsePhase) * 2 : 0;
        
        // Check if it's working hours
        const simulation = window.simulation;
        const isWorkingHours = simulation ? simulation.isWorkingHours() : true;
        
        // Draw engineer circle - different colors for working/idle/inactive
        if (!isWorkingHours) {
            ctx.fillStyle = '#666666'; // Gray when inactive (after hours)
        } else if (isWorking) {
            ctx.fillStyle = '#00e676'; // Green when working
        } else {
            ctx.fillStyle = '#4a9eff'; // Blue when idle but available
        }
        
        if (this.isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + pulseSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw work particles
        this.workParticles.forEach(particle => {
            const alpha = particle.life / particle.maxLife;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw engineer info
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x, this.y - 35);
        
        ctx.font = '10px Arial';
        ctx.fillText(`${this.speed.toFixed(1)}x`, this.x, this.y + 5);
        
        // Show status
        if (!isWorkingHours) {
            ctx.fillStyle = '#cccccc';
            ctx.fillText('INACTIVE', this.x, this.y + 18);
        } else if (this.isIdle()) {
            ctx.fillStyle = '#ff9999';
            ctx.fillText('IDLE', this.x, this.y + 18);
        } else {
            ctx.fillStyle = '#99ff99';
            ctx.fillText('WORKING', this.x, this.y + 18);
        }
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`P:${this.getPendingCount()} I:${this.getIncomingCount()} C:${this.getCompletedCount()}`, this.x, this.y + 40);
    }

    containsPoint(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius;
    }
}

class QueueSimulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.engineers = [];
        this.tasks = [];
        this.taskQueue = [];
        this.completedTasks = [];
        this.selectedEngineer = null;
        this.isPaused = false;
        
        // Statistics
        this.totalQueueTime = 0;
        this.tasksCompletedThisMinute = 0;
        this.lastMinuteReset = Date.now();
        
        // Task spawning
        this.lastTaskSpawn = Date.now();
        this.taskIdCounter = 0;
        
        // Distribution settings
        this.distributionModel = 'round-robin'; // 'round-robin' or 'least-occupied'
        this.currentEngineerIndex = 0; // for round-robin
        
        // Time simulation settings
        this.timeSpeed = 1.0; // 1.0 = 60 seconds = 1 day
        this.simulationStartTime = Date.now();
        this.currentSimulationTime = 0; // milliseconds since start
        this.workingHours = { start: 9, end: 17 }; // 8-hour workday (9-17 = 09:00-17:00 / 9 AM - 5 PM)
        this.lastDebugLog = Date.now();
        
        this.resizeCanvas();
        this.setupEventListeners();
        this.initializeEngineers();
        this.updateUI();
        
        // Initialize severity distribution mode (default to normal)
        this.updateSeverityDistributionMode('normal');
        this.updateNormalDistributionPreview();
        
        // Start animation loop
        this.lastFrameTime = Date.now();
        this.animate();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    setupEventListeners() {
        // Canvas click handler
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Check if clicked on an engineer
            for (let engineer of this.engineers) {
                if (engineer.containsPoint(x, y)) {
                    this.selectEngineer(engineer);
                    break;
                }
            }
        });

        // Resize handler
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        // Control handlers
        document.getElementById('engineerCount').addEventListener('input', (e) => {
            this.setEngineerCount(parseInt(e.target.value));
        });

        document.getElementById('taskRate').addEventListener('input', (e) => {
            document.getElementById('taskRateValue').textContent = parseInt(e.target.value);
        });

        document.getElementById('timeSpeed').addEventListener('input', (e) => {
            this.timeSpeed = parseFloat(e.target.value);
            const secondsPerDay = 60 / this.timeSpeed;
            document.getElementById('timeSpeedValue').textContent = 
                `${this.timeSpeed.toFixed(1)}x (${secondsPerDay.toFixed(0)}s = 1 day)`;
        });

        document.getElementById('minComplexity').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const hours = Math.floor(value);
            const minutes = Math.round((value - hours) * 60);
            const displayText = hours > 0 ? 
                (minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`) :
                `${minutes}min`;
            document.getElementById('minComplexityValue').textContent = displayText;
        });

        document.getElementById('maxComplexity').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const hours = Math.floor(value);
            const minutes = Math.round((value - hours) * 60);
            const displayText = hours > 0 ? 
                (minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`) :
                `${minutes}min`;
            document.getElementById('maxComplexityValue').textContent = displayText;
        });

        // Severity distribution mode listener
        document.getElementById('severityDistributionMode').addEventListener('change', (e) => {
            this.updateSeverityDistributionMode(e.target.value);
        });

        // Normal distribution shift listener
        document.getElementById('normalDistributionShift').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('normalDistributionShiftValue').textContent = value.toFixed(1);
            this.updateNormalDistributionPreview();
        });

        // Custom severity distribution event listeners
        document.getElementById('severity1Chance').addEventListener('input', (e) => {
            document.getElementById('severity1Value').textContent = e.target.value + '%';
        });
        
        document.getElementById('severity2Chance').addEventListener('input', (e) => {
            document.getElementById('severity2Value').textContent = e.target.value + '%';
        });
        
        document.getElementById('severity3Chance').addEventListener('input', (e) => {
            document.getElementById('severity3Value').textContent = e.target.value + '%';
        });
        
        document.getElementById('severity4Chance').addEventListener('input', (e) => {
            document.getElementById('severity4Value').textContent = e.target.value + '%';
        });

        document.getElementById('engineerSpeed').addEventListener('input', (e) => {
            if (this.selectedEngineer) {
                this.selectedEngineer.speed = parseFloat(e.target.value);
                document.getElementById('engineerSpeedValue').textContent = 
                    parseFloat(e.target.value).toFixed(1) + 'x';
                this.updateEngineerList();
            }
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.reset();
        });

        document.getElementById('distributionModel').addEventListener('change', (e) => {
            this.distributionModel = e.target.value;
            this.currentEngineerIndex = 0; // Reset round-robin
        });

        // Action bar event listeners
        document.getElementById('minorIncident').addEventListener('click', () => {
            this.triggerMinorIncident();
        });

        document.getElementById('moderateIncident').addEventListener('click', () => {
            this.triggerModerateIncident();
        });

        document.getElementById('majorIncident').addEventListener('click', () => {
            this.triggerMajorIncident();
        });

        document.getElementById('training').addEventListener('click', () => {
            this.triggerTraining();
        });
    }

    initializeEngineers() {
        const count = parseInt(document.getElementById('engineerCount').value) || 3;
        this.setEngineerCount(count);
    }

    setEngineerCount(count) {
        this.engineers = [];
        this.selectedEngineer = null;
        this.currentEngineerIndex = 0; // Reset round-robin index
        
        // Position engineers in a vertical row
        const startX = this.canvas.width * 0.6;
        const startY = 100;
        const spacing = Math.min(120, (this.canvas.height - 200) / Math.max(count - 1, 1));
        
        for (let i = 0; i < count; i++) {
            const x = startX;
            const y = startY + (i * spacing);
            
            const engineer = new Engineer(x, y, i, `Eng ${i + 1}`);
            engineer.speed = 0.8 + Math.random() * 0.8; // Random speed between 0.8x and 1.6x
            this.engineers.push(engineer);
        }
        
        document.getElementById('engineerCountValue').textContent = count;
        this.updateEngineerList();
    }

    selectEngineer(engineer) {
        // Deselect previous engineer
        if (this.selectedEngineer) {
            this.selectedEngineer.isSelected = false;
        }
        
        // Select new engineer
        this.selectedEngineer = engineer;
        engineer.isSelected = true;
        
        // Show popup with engineer's queues
        showEngineerPopup(engineer);
        
        // Update UI
        document.getElementById('engineerControls').style.display = 'block';
        document.getElementById('noEngineerSelected').style.display = 'none';
        document.getElementById('engineerSpeed').value = engineer.speed;
        document.getElementById('engineerSpeedValue').textContent = engineer.speed.toFixed(1) + 'x';
        
        this.updateEngineerList();
    }

    updateEngineerList() {
        const list = document.getElementById('engineerList');
        list.innerHTML = '';
        
        this.engineers.forEach(engineer => {
            const severities = engineer.getTasksBySeverity();
            const status = engineer.isIdle() ? 'IDLE' : 'WORKING';
            const item = document.createElement('div');
            item.className = 'engineer-item' + (engineer.isSelected ? ' selected' : '');
            item.innerHTML = `
                <div>
                    <div class="engineer-name">${engineer.name} (${status})</div>
                    <div class="engineer-speed">Speed: ${engineer.speed.toFixed(1)}x | Pending: ${engineer.getPendingCount()} | Incoming: ${engineer.getIncomingCount()} | Done: ${engineer.getCompletedCount()}</div>
                    ${engineer.isSelected ? 
                        `<div class="severity-breakdown">Pending - S1: ${severities[1]} | S2: ${severities[2]} | S3: ${severities[3]} | S4: ${severities[4]}</div>` 
                        : ''}
                </div>
            `;
            item.addEventListener('click', () => this.selectEngineer(engineer));
            list.appendChild(item);
        });
    }

    updateSimulationTime(deltaTime) {
        this.currentSimulationTime += deltaTime * this.timeSpeed;
        
        // Convert to simulation hours (1 day = 60 seconds at 1x speed)
        const simulationDays = Math.floor(this.currentSimulationTime / (60 * 1000));
        const dayTime = this.currentSimulationTime % (60 * 1000);
        const hours = Math.floor(dayTime / (60 * 1000 / 24)); // 24 hours in 60 seconds
        const minutes = Math.floor((dayTime % (60 * 1000 / 24)) / (60 * 1000 / 24 / 60));
        
        document.getElementById('currentTime').textContent = 
            `Day ${simulationDays}, ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Update work status (working hours are first 8 hours of the 24-hour day)
        const isWorkingHours = hours >= this.workingHours.start && hours < this.workingHours.end;
        document.getElementById('workStatus').textContent = isWorkingHours ? 'Working Hours' : 'After Hours';
        
        return isWorkingHours;
    }

    isWorkingHours() {
        // Convert current simulation time to hours
        const dayTime = this.currentSimulationTime % (60 * 1000);
        const hours = Math.floor(dayTime / (60 * 1000 / 24)); // 24 hours in 60 seconds
        return hours >= this.workingHours.start && hours < this.workingHours.end;
    }

    assignSeverity() {
        const mode = document.getElementById('severityDistributionMode').value;
        
        if (mode === 'normal') {
            return this.assignSeverityNormal();
        } else {
            return this.assignSeverityCustom();
        }
    }

    assignSeverityNormal() {
        const shift = parseFloat(document.getElementById('normalDistributionShift').value);
        
        // Generate a random number using normal distribution (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        
        // Map normal distribution to severity levels (1-4)
        // Center around 2.5, adjust with shift parameter
        const mean = 2.5 - shift; // Negative shift moves toward higher severity (lower numbers)
        const stdDev = 0.8;
        const normalValue = mean + z * stdDev;
        
        // Clamp to 1-4 range and round
        const severity = Math.max(1, Math.min(4, Math.round(normalValue)));
        return severity;
    }

    assignSeverityCustom() {
        const sev1Chance = parseInt(document.getElementById('severity1Chance').value);
        const sev2Chance = parseInt(document.getElementById('severity2Chance').value);
        const sev3Chance = parseInt(document.getElementById('severity3Chance').value);
        const sev4Chance = parseInt(document.getElementById('severity4Chance').value);
        
        // Normalize the percentages to ensure they add up to 100
        const total = sev1Chance + sev2Chance + sev3Chance + sev4Chance;
        const normalizedSev1 = (sev1Chance / total) * 100;
        const normalizedSev2 = (sev2Chance / total) * 100;
        const normalizedSev3 = (sev3Chance / total) * 100;
        // sev4 gets the remainder
        
        const random = Math.random() * 100;
        
        if (random < normalizedSev1) {
            return 1; // Critical
        } else if (random < normalizedSev1 + normalizedSev2) {
            return 2; // High
        } else if (random < normalizedSev1 + normalizedSev2 + normalizedSev3) {
            return 3; // Medium
        } else {
            return 4; // Low
        }
    }

    updateSeverityDistributionMode(mode) {
        const normalControls = document.getElementById('normalDistributionControls');
        const customControls = document.getElementById('customDistributionControls');
        
        if (mode === 'normal') {
            normalControls.style.display = 'block';
            customControls.style.display = 'none';
            this.updateNormalDistributionPreview();
        } else {
            normalControls.style.display = 'none';
            customControls.style.display = 'block';
        }
    }

    updateNormalDistributionPreview() {
        const shift = parseFloat(document.getElementById('normalDistributionShift').value);
        const samples = 10000;
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        
        // Simulate the distribution to show percentages
        for (let i = 0; i < samples; i++) {
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            
            const mean = 2.5 - shift;
            const stdDev = 0.8;
            const normalValue = mean + z * stdDev;
            const severity = Math.max(1, Math.min(4, Math.round(normalValue)));
            counts[severity]++;
        }
        
        const percentages = {
            1: Math.round((counts[1] / samples) * 100),
            2: Math.round((counts[2] / samples) * 100),
            3: Math.round((counts[3] / samples) * 100),
            4: Math.round((counts[4] / samples) * 100)
        };
        
        document.getElementById('normalDistributionPreview').textContent = 
            `S1: ${percentages[1]}% | S2: ${percentages[2]}% | S3: ${percentages[3]}% | S4: ${percentages[4]}%`;
    }

    generateComplexityNormal(minHours, maxHours) {
        // Generate a random number using normal distribution (Box-Muller transform)
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        
        // Calculate mean and standard deviation from min/max range
        const mean = (minHours + maxHours) / 2;
        const range = maxHours - minHours;
        // Set standard deviation to 1/4 of the range so ~95% of values fall within min-max
        const stdDev = range / 4;
        
        // Generate normal value
        const normalValue = mean + z * stdDev;
        
        // Clamp to min-max range to ensure we don't exceed bounds
        const clampedValue = Math.max(minHours, Math.min(maxHours, normalValue));
        
        return clampedValue;
    }

    triggerMinorIncident() {
        console.log('Minor incident triggered - generating 5 Sev1 tasks');
        this.generateIncidentTasks(5);
    }

    triggerModerateIncident() {
        console.log('Moderate incident triggered - generating 10 Sev1 tasks');
        this.generateIncidentTasks(10);
    }

    triggerMajorIncident() {
        console.log('Major incident triggered - generating 20 Sev1 tasks');
        this.generateIncidentTasks(20);
    }

    generateIncidentTasks(count) {
        for (let i = 0; i < count; i++) {
            // Generate complexity using normal distribution
            const minComplexityEl = document.getElementById('minComplexity');
            const maxComplexityEl = document.getElementById('maxComplexity');
            
            if (!minComplexityEl || !maxComplexityEl) continue;
            
            const minComplexityHours = parseFloat(minComplexityEl.value);
            const maxComplexityHours = parseFloat(maxComplexityEl.value);
            const complexityHours = this.generateComplexityNormal(minComplexityHours, maxComplexityHours);
            
            // Convert simulated hours to actual processing seconds
            const complexity = complexityHours * (60 / 24);
            
            const spawnX = 50;
            const spawnY = Math.random() * (this.canvas.height - 100) + 50;
            
            const task = new Task(spawnX, spawnY, complexity, this.taskIdCounter++);
            // Force severity 1 for incident tasks
            task.severity = 1;
            this.tasks.push(task);
            this.taskQueue.push(task);
        }
    }

    triggerTraining() {
        console.log('Training triggered for all engineers');
        this.engineers.forEach(engineer => {
            // Create a 1-hour training task (simulated time)
            const trainingComplexity = 1 * (60 / 24); // 1 hour in simulated seconds
            
            const trainingTask = new Task(engineer.x, engineer.y, trainingComplexity, this.taskIdCounter++);
            trainingTask.severity = 4; // Low priority
            trainingTask.isTraining = true; // Mark as training task
            trainingTask.state = 'queued'; // Set directly to queued state
            trainingTask.assignedEngineer = engineer;
            
            // Set simulated queue start time for statistics tracking
            trainingTask.simulatedQueueStartTime = this.currentSimulationTime;
            trainingTask.queueStartTime = Date.now();
            
            // Add task to global tasks list for rendering
            this.tasks.push(trainingTask);
            
            // Add directly to engineer's pending queue, bypassing travel
            engineer.pendingQueue.unshift(trainingTask); // Add to front for immediate processing
            
            // Sort pending queue by severity (training will be at back due to severity 4)
            engineer.pendingQueue.sort((a, b) => a.severity - b.severity);
            
            // If engineer is idle, start the training task immediately
            if (!engineer.currentTask) {
                engineer.startNextTask();
            }
            // If engineer is busy, the training task will wait in queue like normal
            
            console.log(`Training task assigned to ${engineer.name}`);
        });
    }

    spawnTask() {
        const now = Date.now();
        const taskRateEl = document.getElementById('taskRate');
        if (!taskRateEl) return;
        
        const tasksPerDay = parseInt(taskRateEl.value);
        
        // In our simulation: 1 day = 60 seconds at 1x speed
        // Tasks come in 24/7, so distribute them across the full day
        const fullDayMs = 60 * 1000; // 24 hours = 60 seconds at 1x speed
        const interval = fullDayMs / tasksPerDay; // milliseconds between spawns across full day
        
        if (now - this.lastTaskSpawn >= interval / this.timeSpeed) {
            const minComplexityEl = document.getElementById('minComplexity');
            const maxComplexityEl = document.getElementById('maxComplexity');
            
            if (!minComplexityEl || !maxComplexityEl) return;
            
            const minComplexityHours = parseFloat(minComplexityEl.value);
            const maxComplexityHours = parseFloat(maxComplexityEl.value);
            const complexityHours = this.generateComplexityNormal(minComplexityHours, maxComplexityHours);
            
            // Convert simulated hours to actual processing seconds
            // 1 simulated day (24 hours) = 60 seconds at 1x speed
            // So 1 simulated hour = 2.5 seconds at 1x speed
            const complexity = complexityHours * (60 / 24); // Convert hours to seconds
            
            const spawnX = 50;
            const spawnY = Math.random() * (this.canvas.height - 100) + 50;
            
            const task = new Task(spawnX, spawnY, complexity, this.taskIdCounter++);
            // Assign severity based on configured probabilities
            task.severity = this.assignSeverity();
            this.tasks.push(task);
            this.taskQueue.push(task);
            
            this.lastTaskSpawn = now;
        }
    }

    assignTasks() {
        // Assign tasks immediately upon creation based on distribution model
        for (let i = this.taskQueue.length - 1; i >= 0; i--) {
            const task = this.taskQueue[i];
            
            let selectedEngineer;
            
            if (this.distributionModel === 'round-robin') {
                selectedEngineer = this.engineers[this.currentEngineerIndex];
                this.currentEngineerIndex = (this.currentEngineerIndex + 1) % this.engineers.length;
            } else if (this.distributionModel === 'least-occupied') {
                // Find engineer with smallest queue
                selectedEngineer = this.engineers.reduce((least, current) => 
                    current.getQueueLength() < least.getQueueLength() ? current : least
                );
            }
            
            if (selectedEngineer) {
                selectedEngineer.assignTask(task);
                this.taskQueue.splice(i, 1);
            }
        }
    }

    update(deltaTime) {
        if (this.isPaused) return;
        
        // Update simulation time and check if it's working hours
        const isWorkingHours = this.updateSimulationTime(deltaTime);
        
        // Debug logging
        if (Date.now() - this.lastDebugLog > 5000) { // Log every 5 seconds
            console.log(`Time: ${this.currentSimulationTime}ms, Working: ${isWorkingHours}, Speed: ${this.timeSpeed}`);
            this.lastDebugLog = Date.now();
        }
        
        // Spawn tasks 24/7 - support tickets come in around the clock
        this.spawnTask();
        
        this.assignTasks();
        
        // Update tasks
        this.tasks.forEach(task => {
            task.update(deltaTime);
            
            if (task.state === 'completed' && !this.completedTasks.includes(task) && !task.isTraining) {
                this.completedTasks.push(task);
                
                // Calculate total time from arrival at engineer until completion in simulated time
                if (task.simulatedQueueStartTime !== null && task.simulatedCompletionTime !== null) {
                    const simulatedDuration = task.simulatedCompletionTime - task.simulatedQueueStartTime;
                    this.totalQueueTime += simulatedDuration;
                }
                
                this.tasksCompletedThisMinute++;
            }
        });
        
        // Update engineers
        this.engineers.forEach(engineer => engineer.update(deltaTime));
        
        // Reset tasks per minute counter
        if (Date.now() - this.lastMinuteReset >= 60000) {
            this.tasksCompletedThisMinute = 0;
            this.lastMinuteReset = Date.now();
        }
        
        this.updateStatistics();
    }

    updateStatistics() {
        document.getElementById('activeTasks').textContent = this.tasks.length;
        document.getElementById('completedTasks').textContent = this.completedTasks.length;
        
        const avgQueueTime = this.completedTasks.length > 0 ? 
            this.totalQueueTime / this.completedTasks.length : 0;
        
        // Convert simulated milliseconds to simulated hours for display
        // 1 simulated day (24 hours) = 60,000ms at 1x speed
        // So 1 simulated hour = 2,500ms
        const avgHours = avgQueueTime / (60 * 1000 / 24);
        
        let displayText;
        if (avgHours >= 1) {
            const hours = Math.floor(avgHours);
            const minutes = Math.round((avgHours - hours) * 60);
            displayText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
            const minutes = Math.round(avgHours * 60);
            displayText = `${minutes}m`;
        }
        
        document.getElementById('avgQueueTime').textContent = displayText;
        
        document.getElementById('tasksPerMin').textContent = this.tasksCompletedThisMinute;
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw spawn area
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(20, 20, 60, this.canvas.height - 40);
        this.ctx.setLineDash([]);
        
        this.ctx.fillStyle = '#666';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Tasks', 50, 15);
        
        // Draw only active tasks (traveling, queued, processing)
        this.tasks.forEach(task => {
            if (task.state !== 'completed') {
                task.draw(this.ctx);
            }
        });
        
        // Draw engineers
        this.engineers.forEach(engineer => engineer.draw(this.ctx));
        
        // Draw queue indicator
        if (this.taskQueue.length > 0) {
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`Queue: ${this.taskQueue.length}`, 100, 30);
        }
    }

    animate() {
        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame(() => this.animate());
    }

    formatComplexityTime(complexitySeconds) {
        // Convert actual processing seconds back to simulated hours for display
        const simulatedHours = complexitySeconds / (60 / 24);
        
        if (simulatedHours >= 1) {
            const hours = Math.floor(simulatedHours);
            const minutes = Math.round((simulatedHours - hours) * 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        } else {
            const minutes = Math.round(simulatedHours * 60);
            return `${minutes}m`;
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        document.getElementById('pauseBtn').textContent = this.isPaused ? 'Resume' : 'Pause';
    }

    reset() {
        this.tasks = [];
        this.taskQueue = [];
        this.completedTasks = [];
        this.totalQueueTime = 0;
        this.tasksCompletedThisMinute = 0;
        this.taskIdCounter = 0;
        this.lastMinuteReset = Date.now();
        
        // Reset time simulation
        this.simulationStartTime = Date.now();
        this.currentSimulationTime = 0;
        this.lastTaskSpawn = Date.now();
        this.lastDebugLog = Date.now();
        
        // Reset engineers
        this.engineers.forEach(engineer => {
            engineer.currentTask = null;
            engineer.pendingQueue = [];
            engineer.incomingTasks = [];
            engineer.completedQueue = [];
            engineer.workParticles = [];
        });
        
        this.currentEngineerIndex = 0;
        
        this.updateEngineerList();
        this.updateStatistics();
    }

    updateUI() {
        this.updateEngineerList();
        this.updateStatistics();
    }
}

// Initialize the simulation when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    const simulation = new QueueSimulation(canvas);
    
    // Make simulation globally accessible for debugging
    window.simulation = simulation;
});

// Popup functions
let currentPopupEngineer = null;
let popupUpdateInterval = null;

function showEngineerPopup(engineer) {
    const popup = document.getElementById('engineerPopup');
    currentPopupEngineer = engineer;
    
    // Setup tab functionality if not already done
    setupTabEventListeners();
    
    // Reset to first tab
    switchTab('pending');
    
    // Initial popup setup
    updatePopupContent();
    popup.style.display = 'flex';
    
    // Start real-time updates
    if (popupUpdateInterval) {
        clearInterval(popupUpdateInterval);
    }
    popupUpdateInterval = setInterval(updatePopupContent, 100); // Update every 100ms
}

function setupTabEventListeners() {
    // Only set up once
    if (window.tabListenersSetup) return;
    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    window.tabListenersSetup = true;
}

function updatePopupContent() {
    if (!currentPopupEngineer) return;
    
    const engineer = currentPopupEngineer;
    const engineerName = document.getElementById('popupEngineerName');
    const pendingCount = document.getElementById('pendingCount');
    const incomingCount = document.getElementById('incomingCount');
    const completedCount = document.getElementById('completedCount');
    const pendingTasks = document.getElementById('pendingTasks');
    const incomingTasks = document.getElementById('incomingTasks');
    const completedTasks = document.getElementById('completedTasks');

    const status = engineer.isIdle() ? 'IDLE' : 'WORKING';
    engineerName.textContent = `${engineer.name} - Task Queues (${status})`;
    
    // Update tab counts
    pendingCount.textContent = engineer.getPendingCount();
    incomingCount.textContent = engineer.getIncomingCount();
    completedCount.textContent = engineer.getCompletedCount();

    // Populate pending tasks
    pendingTasks.innerHTML = '';
    if (engineer.currentTask) {
        const taskItem = createTaskItem(engineer.currentTask, 'Processing');
        pendingTasks.appendChild(taskItem);
    }
    
    engineer.pendingQueue.forEach((task, index) => {
        const taskItem = createTaskItem(task, `Queue Position ${index + 1}`);
        pendingTasks.appendChild(taskItem);
    });

    if (engineer.getPendingCount() === 0) {
        pendingTasks.innerHTML = '<div class="empty-queue">No pending tasks</div>';
    }

    // Populate incoming tasks
    incomingTasks.innerHTML = '';
    engineer.incomingTasks.forEach((task, index) => {
        const taskItem = createTaskItem(task, `Traveling to engineer`);
        incomingTasks.appendChild(taskItem);
    });

    if (engineer.getIncomingCount() === 0) {
        incomingTasks.innerHTML = '<div class="empty-queue">No incoming tasks</div>';
    }

    // Populate completed tasks
    completedTasks.innerHTML = '';
    if (engineer.completedQueue.length === 0) {
        completedTasks.innerHTML = '<div class="empty-queue">No completed tasks</div>';
    } else {
        engineer.completedQueue.slice(-10).reverse().forEach((task, index) => {
            const taskItem = createTaskItem(task, `Completed ${index + 1}`);
            completedTasks.appendChild(taskItem);
        });
    }
}

function createTaskItem(task, status) {
    const taskItem = document.createElement('div');
    let className = `task-item severity-${task.severity}`;
    if (task.wasPreempted) {
        className += ' preempted';
    }
    taskItem.className = className;
    
    // Calculate progress percentage
    let progress = 0;
    if (task.state === 'processing' && task.assignedEngineer && task.assignedEngineer.currentTask === task) {
        // Only show progress for the task currently being processed by the engineer
        progress = Math.max(0, Math.min(100, ((task.complexity - task.remainingTime) / task.complexity * 100)));
    } else if (task.state === 'completed') {
        progress = 100;
    } else if (task.wasPreempted) {
        // Show saved progress for preempted tasks 
        progress = Math.max(0, Math.min(100, ((task.complexity - task.remainingTime) / task.complexity * 100)));
    } else {
        progress = 0; // queued, traveling, etc.
    }
    
    // Format remaining time and status
    let timeInfo = '';
    let statusInfo = status;
    
    if (task.state === 'processing' && task.assignedEngineer && task.assignedEngineer.currentTask === task) {
        timeInfo = `| Remaining: ${Math.max(0, task.remainingTime).toFixed(1)}s`;
    } else if (task.state === 'completed') {
        timeInfo = '| Completed';
    } else if (task.state === 'processing') {
        timeInfo = '| Queued for processing';
    }
    
    // Add preemption indicator
    if (task.wasPreempted && task.remainingTime < task.complexity) {
        const savedProgress = ((task.complexity - task.remainingTime) / task.complexity * 100).toFixed(1);
        statusInfo += ` (Resumed - ${savedProgress}% done)`;
    }
    
    taskItem.innerHTML = `
        <div class="task-info">
            <div class="task-id">Task #${task.id}${task.wasPreempted ? ' ⏸️' : ''}</div>
            <div class="task-details">
                Complexity: ${simulation.formatComplexityTime(task.complexity)} | Status: ${statusInfo} ${timeInfo}
            </div>
            <div class="task-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.toFixed(1)}%"></div>
                </div>
                <span class="progress-text">${progress.toFixed(1)}%</span>
            </div>
        </div>
        <div class="task-severity">S${task.severity}</div>
    `;
    
    return taskItem;
}

function closeEngineerPopup() {
    document.getElementById('engineerPopup').style.display = 'none';
    currentPopupEngineer = null;
    
    // Stop real-time updates
    if (popupUpdateInterval) {
        clearInterval(popupUpdateInterval);
        popupUpdateInterval = null;
    }
}

function switchTab(tabName) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab panel
    document.getElementById(tabName + 'Tab').classList.add('active');
    
    // Add active class to selected tab button
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// Close popup when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const popup = document.getElementById('engineerPopup');
        const popupContent = document.querySelector('.popup-content');
        
        if (popup && popup.style.display === 'flex' && 
            !popupContent.contains(e.target) && 
            !e.target.closest('canvas')) {
            closeEngineerPopup();
        }
    });
    
    // Close popup when pressing Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentPopupEngineer) {
            closeEngineerPopup();
        }
    });
});