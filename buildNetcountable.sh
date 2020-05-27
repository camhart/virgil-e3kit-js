cd ./packages/e3kit-base
npm install
cd ..
cd ./e3kit-browser
npm install
cd ..
cd ./e3kit-node
npm install
cd ..
cd ..

touch ../netcountable-e3kit/e3kit-base/.eslintignore

rm -rf ../netcountable-e3kit/e3kit-browser
mkdir ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/browser.es.js ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/browser.cjs.js ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/package.json ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/README.md ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/worker.cjs.js ../netcountable-e3kit/e3kit-browser
cp ./packages/e3kit-browser/worker.es.js ../netcountable-e3kit/e3kit-browser
cp -r ./packages/e3kit-browser/dist ../netcountable-e3kit/e3kit-browser
touch ../netcountable-e3kit/e3kit-browser/.eslintignore

rm -rf ../netcountable-e3kit/e3kit-node
mkdir ../netcountable-e3kit/e3kit-node
cp ./packages/e3kit-node/declaration.d.ts ../netcountable-e3kit/e3kit-node
cp ./packages/e3kit-node/package.json ../netcountable-e3kit/e3kit-node
cp ./packages/e3kit-node/README.md ../netcountable-e3kit/e3kit-node
cp -r ./packages/e3kit-node/dist ../netcountable-e3kit/e3kit-node
touch ../netcountable-e3kit/e3kit-node/.eslintignore
