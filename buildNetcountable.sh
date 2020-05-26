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

rm -rf ../netcountable-e3kit/e3kit-browser
mkdir ../netcountable-e3kit/e3kit-browser
cp -r ./packages/e3kit-browser/dist/* ../netcountable-e3kit/e3kit-browser

rm -rf ../netcountable-e3kit/e3kit-node
mkdir ../netcountable-e3kit/e3kit-node
cp -r ./packages/e3kit-node/dist/* ../netcountable-e3kit/e3kit-node
