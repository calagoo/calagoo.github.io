var PID_mouseDown;
var PID_mouseUp;
var PID_mouseMove;

function closure() {
    const canvas = document.getElementById("PID_game");
    const ctx = canvas.getContext("2d");
    const lerp = (x, y, a) => x * (1 - a) + y * a; // linear interpolation function

    //other
    var mouseUp_bool = true
    var mouseDown_bool = false
    var mousePosX_click
    var mousePosY_click

    //// sim constants
    const fps = 60; // frames per second
    const dt = (1 / fps) * 1000; // milliseconds per frame
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    //// sim variables
    var targetHeight = 100;
    var targetHeight_pxl = 0;
    var ticks = 0;
    var flameColors = [];
    var height = 50;
    var angle = 0;
    var heightLast = 0;
    var pidOut = [0, 0];
    var density = 1.225; // kg/m^3
    var excessLift = 0;
    var accelY = 0;
    var velY = 0;
    //// Plane Variables (roughly 737).

    // for angles -10 to 10, every 2.5
    // using information from a 737 midspan airfoil at RE == 100k, http://airfoiltools.com/polar/details?polar=xf-b737b-il-100000
    const angle_array = [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
    const CL = [
        -0.8505, -0.6891, -0.498, -0.2414, 0.1618, 0.4767, 0.69, 0.9266, 1.1118,
    ];
    const CD = [
        0.05068, 0.02624, 0.01535, 0.01561, 0.01541, 0.01499, 0.01987, 0.02868,
        0.04215,
    ];

    const mass = 70535; // kg, mtow
    const vel = 200; // m/s
    const sref = 125; // m^2

    // GAME DRAWING MAIN LOOP
    function drawGame() {
        ticks++;
        if (ticks > 60) {
            ticks = 1;
        }
        setTimeout(drawGame, dt);
        clearScreen();
        drawTargetLine();
        planeMove_out = planeMovement(height, targetHeight, angle);
        heightLast = height;
        height = planeMove_out[0];
        angle = planeMove_out[1];
        drawTextData(height, targetHeight, angle);


        // short clamp to make sure the target height isn't too large or small (this is just a backup, the one in the mouseMove() function shouldnt fail)
        if (targetHeight > 150){
            targetHeight = 150
        } 
        else if (targetHeight < 15){
            targetHeight = 15
        }

    }

    function clearScreen() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function heightConvert(ht) {
        return canvas.height - (canvas.height / 200) * ht;
    }
    
    function heightConvertInv(ht){
        return 200 - (ht*200)/canvas.height;
    }


    function drawTargetLine() {
        targetHeight_pxl = heightConvert(targetHeight);

        // draw dashed part of line
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, targetHeight_pxl);
        ctx.lineTo(canvas.width, targetHeight_pxl);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "white";
        ctx.stroke();

        // draw grabbable circle
        ctx.beginPath();
        ctx.fillStyle = "grey";
        ctx.arc(canvas.width - 5, targetHeight_pxl, 20, 0, 2 * Math.PI, false);
        ctx.fill();
    }

    function pid(
        kp,
        ki,
        kd,
        setpoint,
        process_variable,
        dt,
        pv_last,
        ierr,
        high,
        low,
        op0
    ) {
        // Calculate the error
        error = setpoint - process_variable;

        // Calculate the proportional term
        p = kp * error;

        // Calculate the integral term
        ierr = ierr + ki * error * (dt / 1000);
        i = ierr;
        dpv = (process_variable - pv_last) / (dt / 1000);
        // Calculate the derivative term
        d = -kd * dpv;

        // Return the sum of the three terms
        output = op0 + p + i + d;
        if (output < low || output > high) {
            i = i - ki * error * (dt / 1000);
            output = Math.max(low, Math.min(high, output));
        }
        return [output, ierr];
    }

    function planeMovement(height, targetHeight, angle) {

        // Classic PID
        kp = 1;
        ki = 0.001;
        kd = .8;

        pidOut = pid(
            kp,
            ki,
            kd,
            targetHeight,
            height,
            dt,
            heightLast,
            pidOut[1],
            (high = 20),
            (low = -20),
            (op0 = 0.509249975) //bias, at this angle the lift == mass
        );

        angle = pidOut[0];

        var closestAngles = detectClose(angle, angle_array);
        var closestIndex = [
            angle_array.indexOf(closestAngles[0]),
            angle_array.indexOf(closestAngles[1]),
        ];

        // Finding the interpolated value of CL using linear interpolation and the closest values near the angle of attack in order to find the values greater and smaller than CL.
        // for the 3rd element (a) in lerp(x,y,a), we have to specify that when the angles become negative to take the absolute value, if not we will eventually divide by 0 and it will throw an error.
        // the if statement is so that if the angle is negative, we choose the bigger value as 1. Because when we abs, the bigger value is actually the smaller (it is 3:30 am currently... bad explanation)
        if (angle < 0) {
            var CL_interp = lerp(
                CL[closestIndex[0]],
                CL[closestIndex[1]],
                1 -
                (Math.abs(angle) -
                    Math.min(Math.abs(closestAngles[0]), Math.abs(closestAngles[1]))) /
                Math.max(Math.abs(closestAngles[0]), Math.abs(closestAngles[1]))
            );
        } else {
            var CL_interp = lerp(
                CL[closestIndex[0]],
                CL[closestIndex[1]],
                (Math.abs(angle) -
                    Math.min(Math.abs(closestAngles[0]), Math.abs(closestAngles[1]))) /
                Math.max(Math.abs(closestAngles[0]), Math.abs(closestAngles[1]))
            );
        }

        var lift = ((CL_interp * (density * vel ** 2)) / 2) * sref;

        excessLift = lift - mass * 9.81;
        accelY = excessLift / mass;
        velY += (accelY * (dt/1000));
        height += (velY * (dt/1000));
        drawPlane(heightConvert(height));
        return [height, angle];
    }

    function drawPlane(height) {
        var planeLength = 40;
        var planeHeight = 10;

        ctx.fillStyle = "white";

        // Body
        ctx.save();
        ctx.translate(centerX - planeLength / 2, height - planeHeight / 2);
        ctx.rotate((-angle * Math.PI) / 180);
        ctx.fillRect(0, 0, planeLength, planeHeight);
        ctx.restore();
    }

    function drawTextData(height, targetHeight, angle) {
        ctx.font = "16px serif";
        ctx.fillStyle = "white";
        ctx.fillText("Plane Data:", 1, 15);
        ctx.fillText("Height: " + round(height, 1) + " m", 1, 30);
        ctx.fillText(round(targetHeight,0) + " m", 1, targetHeight_pxl-2);
        ctx.fillText("Angle of Attack: " + round(angle, 2) + " deg", canvas.width-175, 15);
        ctx.fillText("Lift: " + round((excessLift+(mass*9.81)) / 1000, 2) + " kN", 1, 45);
        ctx.fillText("Velocity: " + round(velY, 2) + " m/s", 1, 60);
        ctx.font = "12px serif";
        ctx.save()
        ctx.translate(canvas.width-3,targetHeight_pxl+16)
        ctx.rotate(-90*Math.PI/180)
        ctx.fillText("DRAG",0,0)
        ctx.restore()
    }


    function moveTargetHeight(mousePosX,mousePosY){
        targetHeight = heightConvertInv(mousePosY)
        }


    PID_mouseDown = function mouseDown(){
        mouseUp_bool = false
        mouseDown_bool = true
        mousePosX_click = (window.event.pageX - canvas.offsetLeft);
        mousePosY_click = (targetHeight_pxl) - (window.event.pageY - canvas.offsetTop);
    }
    
    PID_mouseMove = function mouseMove(){
        mousePosX_drag = window.event.pageX - canvas.offsetLeft;
        mousePosY_drag = window.event.pageY - canvas.offsetTop;
        if (mouseDown_bool){ // checks if the mouse is currently clicking/holding down
            if (mousePosX_click > 475 && mousePosY_click < 20 && mousePosY_click > -20){ // checks that you clicked originally on the height drag ball
                if (heightConvertInv(mousePosY_drag) <= 150 && heightConvertInv(mousePosY_drag) >= 15){ // doesn't track if you try to change height to too high or too low
                    moveTargetHeight(mousePosX_drag,mousePosY_drag)
                }
            }
        }
    }
    PID_mouseUp = function mouseUp(){
        mouseUp_bool = true
        mouseDown_bool = false
        console.log("Mouse Up")
    }



    const detectClose = (x, array) => {
        // if array has less or equal 2 elements, no further verification needed
        if (array.length <= 2) {
            return array;
        }
        // function to sort array elements by its absolute distance to 'x'
        const sort = (sortArray) =>
            sortArray.sort((a, b) => {
                return Math.abs(a - x) > Math.abs(b - x) ? 1 : -1;
            });
        // gets the numbers to the right, ordered by distance to x
        const higher = sort(array.filter((i) => i > x));
        // gets numbers to the left, ordered by distance to x
        const lower = sort(array.filter((i) => i < x));

        // no higher number? results will come from the left.
        if (higher.length === 0) {
            return [lower[1], lower[0]];
        }

        // if no lower numbers, results must come from the right
        if (lower.length === 0) {
            return [higher[0], higher[1]];
        }

        // it has numbers left or right, return the closest in each array
        return [lower[0], higher[0]];
    };

    const round = (x, sigfigs) => {
        return Math.round(x * 10 ** sigfigs) / 10 ** sigfigs;
    };

    drawGame();
}
closure();
