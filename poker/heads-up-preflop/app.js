// $("#output").html("Width: " + window.innerWidth + "<br>Height: " + window.innerHeight);
        // Project is approx 500 px wide by 666 px tall
        let zoom = Math.min(window.innerWidth, window.innerHeight * 0.75) / 5;
        // Keep native browser zoom and the shared navigation readable.

        // Focus on text box and press enter to click the roll button
        document.getElementById("input").focus();
        $("#input").keyup(function(event) {
            if (event.keyCode === 13) {
                $("#roll").click();
            }
        });

        cards = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

        handsDiv = $("#hands");
        // Array of array of [hand, id] for each of the 169 buttons
        handButtons = [];

        // Fills div with 13x13 grid of buttons for each hand
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                let handType;
                let hand = cards[i] + cards[j];
                if (i < j) { // Suited
                    hand += "s";
                    handType = "suited";
                } else if (i > j) { // Offsuit
                    hand = hand[1] + hand[0];
                    hand += "o";
                    handType = "offsuit";
                } else {
                    handType = "pocketPair";
                }
                handsDiv.html(handsDiv.html() + "<button class='text hand " + handType + "' id='" + hand + "' onclick='roll(\"" + hand + "\")''>" + hand + "</button>");
                handButtons.push([hand, i * 13 + j]);
            }
            handsDiv.html(handsDiv.html() + "<br>");
        }

        template = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/
          /*K*/
          /*Q*/
          /*J*/
          /*T*/
          /*9*/
          /*8*/
          /*7*/
          /*6*/
          /*5*/
          /*4*/
          /*3*/
          /*2*/
        ];

        sb_open = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*K*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*Q*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*J*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*T*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*9*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*8*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*7*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*6*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*5*/ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
          /*4*/ 100, 100, 100,   0,   0,   0,   0, 100, 100, 100, 100, 100, 100,
          /*3*/ 100, 100,   0,   0,   0,   0,   0,   0,   0, 100, 100, 100, 100,
          /*2*/ 100, 100,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 100
        ];

        bb_3bet = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/ 100, 100, 100, 100, 100,  50,  50,  50,  50,  50,  50,  50,  50,
          /*K*/ 100, 100, 100, 100, 100,  75,  50,  50,  35,  35,  20,  20,  20,
          /*Q*/ 100,  50, 100, 100, 100,  75,  50,  50,  35,  35,  20,   0,   0,
          /*J*/  50,  20,  20, 100, 100,  75,  50,  50,  35,  20,   0,   0,   0,
          /*T*/  20,  10,  10,  10, 100, 100, 100,  50,  20,  20,   0,   0,   0,
          /*9*/  10,  10,  10,  10,  10, 100, 100,  75,  50,  20,   0,   0,   0,
          /*8*/  10,  10,  10,  10,  10,  10, 100, 100,  75,  50,  20,   0,   0,
          /*7*/   0,   0,   0,   0,   0,   0,  10,  50, 100,  75,  50,  20,   0,
          /*6*/   0,   0,   0,   0,   0,   0,   0,  10,  50, 100,  75,  50,   0,
          /*5*/   0,   0,   0,   0,   0,   0,   0,   0,  10,  50, 100,  75,   0,
          /*4*/   0,   0,   0,   0,   0,   0,   0,   0,   0,  10,  50,  50,  20,
          /*3*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  20,  20,
          /*2*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  20
        ];

        bb_call_open = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/   0,   0,   0,   0,   0,  50,  50,  50,  50,  50,  50,  50,  50,
          /*K*/   0,   0,   0,   0,   0,  25,  50,  50,  65,  65,  80,  80,  80,
          /*Q*/   0,  50,   0,   0,   0,  25,  50,  50,  65,  65,  80, 100, 100,
          /*J*/  50,  80,  80,   0,   0,  25,  50,  50,  65,  80, 100, 100, 100,
          /*T*/  80,  90,  90,  90,   0,   0,   0,  50,  80,  80, 100, 100, 100,
          /*9*/  90,  90,  90,  90,  90,   0,   0,  25,  50,  80, 100, 100, 100,
          /*8*/  90,  90,  90,  90,  90,  90,   0,   0,  25,  50,  80, 100, 100,
          /*7*/ 100, 100, 100, 100, 100, 100,  90,  50,   0,  25,  50,  80, 100,
          /*6*/ 100, 100, 100, 100, 100, 100, 100,  90,  50,   0,  25,  50, 100,
          /*5*/ 100, 100,  75,  50,  35,  35,  35, 100,  90,  50,   0,  25, 100,
          /*4*/ 100,  90,  50,   0,   0,   0,   0,   0,  50,  90,  50,  50,  80,
          /*3*/ 100,  90,  50,   0,   0,   0,   0,   0,   0,  25,  25,  80,  80,
          /*2*/ 100,  90,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  80
        ];

        sb_4bet = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/ 100, 100,  50,  10,  10,   2,   2,   2,   2,   2,   2,   2,   2,
          /*K*/ 100, 100,   2,   2,   2,   7,   7,   7,   7,   7,   7,   4,   4,
          /*Q*/  15,  10, 100,   2,   2,   7,   7,   7,   7,   4,   4,   4,   4,
          /*J*/  12,  10,   5, 100,   2,   7,   7,   7,   7,   4,   4,   4,   4,
          /*T*/  12,   4,   5,   5, 100,   4,   7,   7,   7,   4,   4,   4,   4,
          /*9*/  10,   4,   4,   4,   4,  20,   4,   7,   7,   7,   4,   4,   4,
          /*8*/  10,   4,   4,   4,   4,   4,  10,  10,   7,   7,   7,   4,   4,
          /*7*/  10,   4,   4,   4,   4,   4,   4,   0,  10,   7,   7,   7,   4,
          /*6*/  10,   4,   4,   0,   0,   0,   4,   4,   0,  10,   7,   7,   4,
          /*5*/  20,   0,   0,   0,   0,   0,   0,   4,   4,   0,  10,   7,   4,
          /*4*/  20,   0,   0,   0,   0,   0,   0,   0,   4,   4,   0,  10,   4,
          /*3*/  15,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   4,
          /*2*/  15,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0
        ];

        sb_call_3bet = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/   0,   0,  50,  96,  96,  98,  98,  98,  98,  98,  98,  98,  98,
          /*K*/   0,   0,  98,  98,  98,  96,  96,  96,  96,  96,  96,  96,  96,
          /*Q*/  85,  90,   0,  98,  98,  96,  96,  96,  96,  96,  96,  50,  50,
          /*J*/  88,  95,  95,   0,  98,  96,  96,  96,  96,  96,  50,  50,   0,
          /*T*/  88,  95,  95,  95,   0,  96,  96,  96,  96,  96,  50,   0,   0,
          /*9*/  75,  60,  60,  60,  60,  80,  96,  96,  96,  96,  50,   0,   0,
          /*8*/  75,  10,  10,  10,  10,  10,  90,  93,  96,  96,  96,   0,   0,
          /*7*/  20,   0,   0,   0,   0,   0,  10, 100,  93,  96,  96,  50,   0,
          /*6*/  20,   0,   0,   0,   0,   0,   0,   0, 100,  93,  96,  96,  50,
          /*5*/  60,   0,   0,   0,   0,   0,   0,   0,   0, 100,  93,  96,  50,
          /*4*/  60,   0,   0,   0,   0,   0,   0,   0,   0,   0, 100,  93,  50,
          /*3*/  20,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 100,  50,
          /*2*/  20,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, 100,
        ];

        bb_5bet = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/  65, 100,   0,   0,   0,   0,  20,  20,   0,   0,   0,  20,  20,
          /*K*/ 100, 100,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*Q*/   0,   5, 100,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*J*/  10,   0,   0, 100,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*T*/   5,   0,   0,   0,  50,   0,   0,   0,   0,   0,   0,   0,   0,
          /*9*/   0,   0,   0,   0,   0,  20,   0,   0,   0,   0,   0,   0,   0,
          /*8*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*7*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*6*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*5*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*4*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*3*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
          /*2*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0
        ];

        bb_call_4bet = [
          //     A    K    Q    J    T    9    8    7    6    5    4    3    2
          /*A*/  35,   0, 100, 100, 100, 100,  50,  25,  25, 100, 100,  50,  50,
          /*K*/   0,   0, 100, 100, 100, 100,  75,  50,   0,   0,   0,   0,   0,
          /*Q*/ 100,  50,   0, 100, 100, 100,  75,   0,   0,   0,   0,   0,   0,
          /*J*/  50,  10,  10,   0, 100, 100,  75,   0,   0,   0,   0,   0,   0,
          /*T*/  10,   0,   0,   0,  50, 100,  75,   0,   0,   0,   0,   0,   0,
          /*9*/   0,   0,   0,   0,   0,  80, 100,  75,   0,   0,   0,   0,   0,
          /*8*/   0,   0,   0,   0,   0,   0, 100, 100,   0,   0,   0,   0,   0,
          /*7*/   0,   0,   0,   0,   0,   0,   0, 100, 100,   0,   0,   0,   0,
          /*6*/   0,   0,   0,   0,   0,   0,   0,   0, 100, 100,   0,   0,   0,
          /*5*/   0,   0,   0,   0,   0,   0,   0,   0,   0, 100, 100,   0,   0,
          /*4*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  50,  50,   0,
          /*3*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  20,   0,
          /*2*/   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,  20
        ];

        // Fix numbers not adding up to 100 in sb_4bet and sb_call_3bet
        for (let i = 0; i < 13*13; i++) {
            if (sb_4bet[i] + sb_call_3bet[i] > 100) {
                sb_call_3bet[i] = 100 - sb_4bet[i];
            }
        }

        function roll(hand) {
            let input;
            // If hand button is clicked
            if (hand != null) {
                document.getElementById("input").value = hand;
                input = hand.toUpperCase();
                $(".selected").removeClass("selected");
                $("#" + hand).addClass("selected");
            } else { // If roll button is clicked
                input = document.getElementById("input").value.toUpperCase();
            }
            let hand_id = 0;
            if (input.length < 2 || input.length > 3) {
                document.getElementById("output").innerHTML = "Hand must be 2 or 3 characters long";
                return;
            } else if (cards.indexOf(input[0]) === -1 || cards.indexOf(input[1]) === -1) {
                document.getElementById("output").innerHTML = "Invalid card";
                return;
            } else if ((input.length === 2 && input[0] !== input[1]) || (input.length === 3 && !(input[2] === "O" || input[2] == "S"))) {
                document.getElementById("output").innerHTML = "Suitedness must be specified with an \"o\" or \"s\"";
                return;
            } else if (input.length === 2) { // Pocket Pair
                hand_id = cards.indexOf(input[0]) * 14;
            } else if (input[2] == "S") { // Suited
                if (cards.indexOf(input[0]) < cards.indexOf(input[1])) { // Big card first
                    hand_id = cards.indexOf(input[0]) * 13 + cards.indexOf(input[1]);
                } else {
                    hand_id = cards.indexOf(input[1]) * 13 + cards.indexOf(input[0]);
                }
            } else { // Unsuited
                if (cards.indexOf(input[0]) < cards.indexOf(input[1])) { // Big card first
                    hand_id = cards.indexOf(input[1]) * 13 + cards.indexOf(input[0]);
                } else {
                    hand_id = cards.indexOf(input[0]) * 13 + cards.indexOf(input[1]);
                }
            }

            let action = "";
            if (document.getElementById("rfi").checked) {
                action = "rfi";
                $(".fold").removeClass("fold");
                $(".raise").removeClass("raise");
                handButtons.forEach(function(handIdPair) {
                    if (sb_open[handIdPair[1]] === 0) {
                        $("#" + handIdPair[0]).addClass("fold");
                    }
                });
            } else if (document.getElementById("open").checked) {
                action = "open";
                $(".fold").removeClass("fold");
                $(".raise").removeClass("raise");
                handButtons.forEach(function(handIdPair) {
                    if (bb_call_open[handIdPair[1]] === 0 && bb_3bet[handIdPair[1]] === 0) {
                        $("#" + handIdPair[0]).addClass("fold");
                    } else if (bb_3bet[handIdPair[1]] === 100) {
                        $("#" + handIdPair[0]).addClass("raise");
                    } // Mix colors here
                });
            } else if (document.getElementById("3bet").checked) {
                action = "3bet";
                $(".fold").removeClass("fold");
                $(".raise").removeClass("raise");
                handButtons.forEach(function(handIdPair) {
                    if (sb_call_3bet[handIdPair[1]] === 0 && sb_4bet[handIdPair[1]] === 0) {
                        $("#" + handIdPair[0]).addClass("fold");
                    } else if (sb_4bet[handIdPair[1]] === 100) {
                        $("#" + handIdPair[0]).addClass("raise");
                    }
                });
            } else if (document.getElementById("4bet").checked) {
                action = "4bet";
                $(".fold").removeClass("fold");
                $(".raise").removeClass("raise");
                handButtons.forEach(function(handIdPair) {
                    if (bb_call_4bet[handIdPair[1]] === 0 && bb_5bet[handIdPair[1]] === 0) {
                        $("#" + handIdPair[0]).addClass("fold");
                    } else if (bb_5bet[handIdPair[1]] === 100) {
                        $("#" + handIdPair[0]).addClass("raise");
                    }
                });
            }

            let output;
            let random = Math.floor(Math.random() * 100); // Random number from 0 to 99
            if (action === "rfi") {
                if (sb_open[hand_id] === 100) {
                    output = "Open";
                } else {
                    output = "Fold";
                }
            } else if (action === "open") {
                if (random >= 100 - bb_3bet[hand_id]) {
                    output = "Roll: " + random + " = 3-Bet<br><br>3-Bet: " + bb_3bet[hand_id] + "%<br>Call Open: " + bb_call_open[hand_id] + "%";
                } else if (random >= 100 - bb_3bet[hand_id] - bb_call_open[hand_id]) {
                    output = "Roll: " + random + " = Call Open<br><br>3-Bet: " + bb_3bet[hand_id] + "%<br>Call Open: " + bb_call_open[hand_id] + "%";
                } else {
                    output = "Roll: " + random + " = Fold<br><br>3-Bet: " + bb_3bet[hand_id] + "%<br>Call Open: " + bb_call_open[hand_id] + "%";
                }
            } else if (action === "3bet") {
                if (random >= 100 - sb_4bet[hand_id]) {
                    output = "Roll: " + random + " = 4-Bet<br><br>4-Bet: " + sb_4bet[hand_id] + "%<br>Call 3-Bet: " + sb_call_3bet[hand_id] + "%";
                } else if (random >= 100 - sb_4bet[hand_id] - sb_call_3bet[hand_id]) {
                    output = "Roll: " + random + " = Call 3-Bet<br><br>4-Bet: " + sb_4bet[hand_id] + "%<br>Call 3-Bet: " + sb_call_3bet[hand_id] + "%";
                } else {
                    output = "Roll: " + random + " = Fold<br><br>4-Bet: " + sb_4bet[hand_id] + "%<br>Call 3-Bet: " + sb_call_3bet[hand_id] + "%";
                }
            } else {
                if (random >= 100 - bb_5bet[hand_id]) {
                    output = "Roll: " + random + " = 5-Bet<br><br>5-Bet: " + bb_5bet[hand_id] + "%<br>Call 4-Bet: " + bb_call_4bet[hand_id] + "%";
                } else if (random >= 100 - bb_5bet[hand_id] - bb_call_4bet[hand_id]) {
                    output = "Roll: " + random + " = Call 4-Bet<br><br>5-Bet: " + bb_5bet[hand_id] + "%<br>Call 4-Bet: " + bb_call_4bet[hand_id] + "%";
                } else {
                    output = "Roll: " + random + " = Fold<br><br>5-Bet: " + bb_5bet[hand_id] + "%<br>Call 4-Bet: " + bb_call_4bet[hand_id] + "%";
                }
            }

            document.getElementById("output").innerHTML = output;
        }

        $("#darkMode").click();
        function darkMode() {
            if (document.getElementById("darkMode").checked) {
                document.getElementById("html").classList.add("black");
                $(".text").addClass("whiteText");
            } else {
                document.getElementById("html").classList.remove("black");
                $(".text").removeClass("whiteText");
            }
        }

        info_hidden = true;
        $(".info").hide();
        function info() {
            if (info_hidden) {
                $(".info").show();
                $("#info").html("Hide Info");
                info_hidden = false;
            } else {
                $(".info").hide();
                $("#info").html("Show Info");
                info_hidden = true;
            }
        }

        // Meme
        $("#KJo").click();
        $("#input").val("JKo");
        function selectAction(action) {
            $(".selectedAction").removeClass("selectedAction");
            $("#" + action + "Text").addClass("selectedAction");
            roll();
        }

        //for (var i = 0; i < 13*13; i++) {if (bb_3bet[i] + bb_call_open[i] > 100) {console.log(cards[~~(i/13)] + cards[i % 13] + " Total: " + (bb_3bet[i] + bb_call_open[i]))}}
        //for (var i = 0; i < 13*13; i++) {if (sb_4bet[i] + sb_call_3bet[i] > 100) {console.log(cards[~~(i/13)] + cards[i % 13] + " Total: " + (sb_4bet[i] + sb_call_3bet[i]))}}
        //for (var i = 0; i < 13*13; i++) {if (bb_5bet[i] + bb_call_4bet[i] > 100) {console.log(cards[~~(i/13)] + cards[i % 13] + " Total: " + (bb_5bet[i] + bb_call_4bet[i]))}}
