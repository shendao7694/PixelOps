# Pixel Ops - A Fps Game

> OriginalAuthor: [https://github.com/Ooxygen7/](Ooxygen7)

The code structure has been optimized, and two new maps (**Top Secret Aerospace** and **Parkour Map**) have been added

## Quick Start

1. Install Dependence

    ```powershell
    npm install
    cd public
    npm install
    ```

2. StartCmds

    | Cmd | Introduction |
    | :--- | :--- |
    | npm start | Start in account mode |
    | npm run start:guest | Start in guest mode |
    | npm run build | Build fronted script to dist |

## Additional Notes

1. Loacl Clients
    Use npm ‘electron‘ to implement a local browser
    Path ./clients/

2. Cmd
    | Cmd | Introduction |
    | :--- | :--- |
    | npm run local | Start game at local |
    | npm run client | Start browser link to my server(account mode) |
    | npm run clientG | Start browser link to my server(guest mode) |
    | npm run edit | Start map edit controller |

3. Public Service Dependency
    - Account OAuth: [https://psteam.pages.dev/](PsTeamWeb)
    - Public Server(Account): [http://120.26.144.69:7694/](IpServer)
    - Public Server(Guest): [http://120.26.144.69:7695/](IpServer)