
            window.onload = function () {
                home();
            }
            function wwi() {
                document.getElementById("audioSample").src = "tiger-rag-the-original-dixieland-jazz-band-1917.mp3";
                document.getElementById("audioControls").volume = 1.0;
                document.getElementById("audioControls").load();
                document.getElementById("audioControls").play();
                hideInfo();
                document.getElementById("wwiInfo").hidden = false;
                scrollAppear();
            }
            function roaring() {
                document.getElementById("audioSample").src = "james-p-johnson-the-charleston-1925.mp3";
                document.getElementById("audioControls").volume = 0.5;
                document.getElementById("audioControls").load();
                document.getElementById("audioControls").play();
                hideInfo();
                document.getElementById("roaringInfo").hidden = false;
                scrollAppear();
            }
            function great() {
                document.getElementById("audioSample").src = "judy-garland-over-the-rainbow-subtitiles.mp3";
                document.getElementById("audioControls").volume = 1.0;
                document.getElementById("audioControls").load();
                document.getElementById("audioControls").play();
                hideInfo();
                document.getElementById("greatInfo").hidden = false;
                scrollAppear();
            }
            function wwii() {
                document.getElementById("audioSample").src = "bing-crosby-white-christmas-1942-original-version.mp3";
                document.getElementById("audioControls").volume = 1.0;
                document.getElementById("audioControls").load();
                document.getElementById("audioControls").play();
                hideInfo();
                document.getElementById("wwiiInfo").hidden = false;
                scrollAppear();
            }

            //BELOW ARE THE NAV BUTTON FUNCTIONS

            function home() {
                hideTabs();
                document.getElementById("homeTab").hidden = false;
            }

            function juke() {
                hideTabs();
                document.getElementById("jukeboxTab").hidden = false;
            }

            function social() {
                hideTabs();
                document.getElementById("socialTab").hidden = false;
            }

            function political() {
                hideTabs();
                document.getElementById("politicalTab").hidden = false;
            }

            function technological() {
                hideTabs();
                document.getElementById("techTab").hidden = false;
            }

            function hightstown() {
                hideTabs();
                document.getElementById("htownTab").hidden = false;
            }

            function hideTabs() {
                document.getElementById("audioControls").hidden = true;
                document.getElementById("homeTab").hidden = true;
                document.getElementById("jukeboxTab").hidden = true;
                document.getElementById("wwiInfo").hidden = true;
                document.getElementById("roaringInfo").hidden = true;
                document.getElementById("greatInfo").hidden = true;
                document.getElementById("wwiiInfo").hidden = true;
                document.getElementById("socialTab").hidden = true;
                document.getElementById("politicalTab").hidden = true;
                document.getElementById("techTab").hidden = true;
                document.getElementById("htownTab").hidden = true;
                document.getElementById("audioControls").pause();
            }

            function stopMusic() {
                document.getElementById("audioControls").pause();
            }

            function hideInfo() {
                document.getElementById("wwiInfo").hidden = true;
                document.getElementById("roaringInfo").hidden = true;
                document.getElementById("greatInfo").hidden = true;
                document.getElementById("wwiiInfo").hidden = true;
            }

            var timer = setInterval(tick, 10);
            var scrollCounter = -1;
            var scrollOpacity = 0;

            function tick() {
                if (scrollCounter === 0) {
                    document.getElementById("scroll").hidden = false;
                    document.getElementById("scroll").style.opacity = 0;
                    scrollOpacity = 0;
                    scrollCounter++;
                }
                if (scrollCounter > 0 && scrollCounter <= 40) {
                    scrollOpacity += 0.1;
                    document.getElementById("scroll").style.opacity = scrollOpacity;
                    scrollCounter++;
                }
                if (scrollCounter > 40 && scrollCounter <= 200) {
                    scrollCounter++;
                }
                if (scrollCounter > 200 && scrollCounter <= 280) {
                    scrollOpacity -= 0.05;
                    document.getElementById("scroll").style.opacity = scrollOpacity;
                    scrollCounter++;
                }
                if (scrollCounter > 280) {
                    document.getElementById("scroll").hidden = true;
                    scrollCounter = -1;
                    scrollOpacity = 0;
                }
            }

            function scrollAppear() {
                scrollCounter = 0;
            }
