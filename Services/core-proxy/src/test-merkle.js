var merkle = require('merkle-tree-gen');
var cmdArgs = require('command-line-args');

var cmdOptions = [
	{name: 'file', alias: 'f', type:String}
]

var options = cmdArgs(cmdOptions)
// Set up the arguments
var args = {
    file: options.file, // required
    hashalgo: 'sha256', // optional, defaults to sha256
    blocksize: 1048576  // optional, defaults to 1 MiB, 1048576 Bytes
};

// Generate the tree
merkle.fromFile(args, function (err, tree) {
	//console.log(JSON.stringify(tree))
	Object.keys(tree).forEach(k => {
		if (tree[k].type) {
			console.log(k)
		}
	})
	console.log("")
    if (!err) {
        console.log('Root hash: ' + tree.root);
        console.log('Number of leaves: ' + tree.leaves);
        console.log('Number of levels: ' + tree.levels);
    }
});
