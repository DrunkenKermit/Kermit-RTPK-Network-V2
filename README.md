<h1 align="center">Kermit RTPK Network</h1>

<p align="center">
  A UBG project built to be clean, simple, and easy to use. With over 1000 games, a fast and powerful browser, extensive customization options, and much more.
</p>
 
<hr>

## Deployment

Cherri is deployable to remotely any hosting service, and even locally deployable.

Follow the steps below to deploy.

### Method 1: Deploy Buttons

[![Deploy to Heroku](https://binbashbanana.github.io/deploy-buttons/buttons/remade/heroku.svg)](https://heroku.com/deploy/?template=https://github.com/x8rr/cherri)
[![Run on Replit](https://binbashbanana.github.io/deploy-buttons/buttons/remade/replit.svg)](https://replit.com/github/x8rr/cherri)
[![Remix on Glitch](https://binbashbanana.github.io/deploy-buttons/buttons/remade/glitch.svg)](https://glitch.com/edit/#!/import/github/x8rr/cherri)
[![Deploy to Amplify Console](https://binbashbanana.github.io/deploy-buttons/buttons/remade/amplifyconsole.svg)](https://console.aws.amazon.com/amplify/home#/deploy?repo=https://github.com/x8rr/cherri)
[![Run on Google Cloud](https://binbashbanana.github.io/deploy-buttons/buttons/remade/googlecloud.svg)](https://deploy.cloud.run/?git_repo=https://github.com/x8rr/cherri)
[![Deploy to Oracle Cloud](https://binbashbanana.github.io/deploy-buttons/buttons/remade/oraclecloud.svg)](https://cloud.oracle.com/resourcemanager/stacks/create?zipUrl=https://github.com/x8rr/cherri/archive/refs/heads/main.zip)
[![Deploy on Railway](https://binbashbanana.github.io/deploy-buttons/buttons/remade/railway.svg)](https://railway.app/new/template?template=https://github.com/x8rr/cherri)
[![Deploy to Vercel](https://binbashbanana.github.io/deploy-buttons/buttons/remade/vercel.svg)](https://vercel.com/new/clone?repository-url=https://github.com/x8rr/cherri)
[![Deploy to Netlify](https://binbashbanana.github.io/deploy-buttons/buttons/remade/netlify.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/x8rr/cherri)
[![Deploy to Koyeb](https://binbashbanana.github.io/deploy-buttons/buttons/remade/koyeb.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/x8rr/cherri&branch=Main&name=cherri)
[![Deploy to Render](https://binbashbanana.github.io/deploy-buttons/buttons/remade/render.svg)](https://render.com/deploy?repo=https://github.com/x8rr/cherri)
[![Deploy to Cyclic](https://binbashbanana.github.io/deploy-buttons/buttons/remade/cyclic.svg)](https://app.cyclic.sh/api/app/deploy/x8rr/cherri)

> [!IMPORTANT]
> To deploy on Cloudflare Pages, use [this repository.](https://github.com/x8rr/cherri-cloudflare)
> This version excludes Classplay store files due to Cloudflare’s 25 MB limit.

### Method 2: Deploying Locally

Clone the repository:

```sh
git clone https://github.com/x8rr/cherri.git
```

Enter the directory:

```sh
cd cherri
```

Run a local development server:

```sh
python3 -m http.server        # simple Python HTTP server
netlify dev                   # emulate a Netlify production environment
```

### Method 3: Deploying to Firebase

Ensure you have a Firebase account and a project ready.

Install the Firebase CLI:

```sh
npm i -g firebase-tools
```

Initialize a hosting project:

```sh
firebase init hosting
```

Follow the CLI steps, then deploy.

---
