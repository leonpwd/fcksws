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
                NODE_ENV = "production";
              };
              serviceConfig = {
                ExecStart = "${cfg.package}/bin/fcksws";
                Restart = "always";
                RestartSec = "5s";
                DynamicUser = true;
              };
            };
          };
        };
    };
}
