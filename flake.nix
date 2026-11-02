{
  description = "fcksws - Lightweight QR code sharing web app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.stdenv.mkDerivation {
            pname = "fcksws";
            version = "0.1.0";
            src = ./.;

            nativeBuildInputs = [ pkgs.makeWrapper ];

            dontBuild = true;

            installPhase = ''
              mkdir -p $out/share/fcksws $out/bin
              cp -r dist $out/share/fcksws/
              mkdir -p $out/share/fcksws/src
              cp -r src/public $out/share/fcksws/src/

              makeWrapper ${pkgs.bun}/bin/bun $out/bin/fcksws \
                --run "cd $out/share/fcksws" \
                --add-flags "run dist/server.js"
            '';
          };
        }
      );

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.fcksws;
        in {
          options.services.fcksws = {
            enable = lib.mkEnableOption "fcksws QR code service";
            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "Port to listen on";
            };
            host = lib.mkOption {
              type = lib.types.str;
              default = "127.0.0.1";
              description = "Address to listen on (use 0.0.0.0 to expose the service on every interface)";
            };
            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
              description = "fcksws package to use";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.fcksws = {
              description = "fcksws QR code web service";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];
              environment = {
                PORT = toString cfg.port;
                HOST = cfg.host;
                NODE_ENV = "production";
              };
              serviceConfig = {
                ExecStart = "${cfg.package}/bin/fcksws";
                Restart = "always";
                RestartSec = "5s";
                DynamicUser = true;

                # Sandboxing. MemoryDenyWriteExecute and SystemCallFilter are left out on purpose:
                # Bun's JIT needs writable+executable memory and may use io_uring.
                NoNewPrivileges = true;
                CapabilityBoundingSet = "";
                AmbientCapabilities = "";
                PrivateTmp = true;
                PrivateDevices = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                ProtectKernelTunables = true;
                ProtectKernelModules = true;
                ProtectKernelLogs = true;
                ProtectControlGroups = true;
                ProtectClock = true;
                ProtectHostname = true;
                RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
                RestrictNamespaces = true;
                RestrictRealtime = true;
                RestrictSUIDSGID = true;
                LockPersonality = true;
                SystemCallArchitectures = "native";
                UMask = "0077";
              };
            };
          };
        };
    };
}
