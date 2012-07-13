(function () {
    buster.captureServer = buster.captureServer || {};
    buster.captureServer.prison = {
        create: function () {
            var instance = buster.create(this);

            // TODO: Provide these somehow, so the browser doesn't
            // have to guess them.
            // #sdepold: This should imho be passed from outside. Doing so would also help
            // passing the basicAuth information to the prison.
            var hostAndPort = /^[a-z]+:\/\/([^\/]+)/.exec(window.location)[1].split(":");
            var host = hostAndPort[0];
            var port = parseInt(hostAndPort[1] || "80", 10);

            instance.slaveId = /^[a-z]+:\/\/[^\/]+\/slaves\/([^\/]+)/.exec(window.location)[1];
            instance.capturePath = "http://" + host + ":" + port + "/capture";

            var pubsubOptions = {
                host: host,
                port: port
            };

            if(typeof basicAuth !== 'undefined') {
                pubsubOptions.auth = basicAuth;
            }

            // serverClient is actually a pubsub-client
            instance.serverClient = buster.captureServer.pubsubClient.create(pubsubOptions);

            return instance;
        },

        listen: function () {
            var self = this;
            var frameEl = document.getElementById("session_frame");
            var sessionFrame = buster.captureServer.prisonUtil.frame(frameEl);

            var loadEvent = "slave:" + self.slaveId + ":session:load";
            var loadedEvent = "slave:" + self.slaveId + ":session:loaded";
            var unloadEvent = "slave:" + self.slaveId + ":session:unload";
            var unloadedEvent = "slave:" + self.slaveId + ":session:unloaded";

            // serverClient is actually a pubsub-client
            this.serverClient.connect().then(function () {
                // TODO: Don't use the faye client directly for this
                self.serverClient._fayeClient.addExtension({
                    incoming: function (message, callback) {
                        var serverIsBackAfterRestart =
                            message.channel == "/meta/connect"
                            && message.successful == false
                            && (/^401/.test(message.error));

                        if (serverIsBackAfterRestart) {
                            window.location = self.capturePath;
                            return;
                        }
                        callback(message);
                    }
                });

                self.serverClient.on(loadEvent, function (session) {
                    self.currentSession = session;
                    self.sessionClient = buster.captureServer.sessionClient._create(
                        session,
                        self.serverClient
                    );
                    self.sessionClient.clientId = self.slaveId;

                    sessionFrame.setSrc(session.resourcesPath + "/", function () {
                        self.serverClient.emit(loadedEvent);
                    });
                });

                self.serverClient.on(unloadEvent, function () {
                    sessionFrame.setSrc("", function () {
                        self.serverClient.emit(unloadedEvent);
                    });
                });

                // serverClient is actually a pubsub-client
                self.serverClient.emit("slave:" + self.slaveId + ":imprisoned", {
                    pubsubClientId: self.serverClient.id,
                    userAgent: navigator.userAgent
                });
            });
        },

        initSessionFrame: function (sessionBuster) {
            var self = this;

            sessionBuster.emit = function (event, data) {
                self.sessionClient.emit(event, data);
            };
            sessionBuster.on = function (event, handler) {
                self.sessionClient.on(event, handler);
            };

            sessionBuster.env = sessionBuster.env || {};
            sessionBuster.env.contextPath = this.currentSession.resourcesPath;
            sessionBuster.env.id = this.slaveId;
        }
    };
}());
