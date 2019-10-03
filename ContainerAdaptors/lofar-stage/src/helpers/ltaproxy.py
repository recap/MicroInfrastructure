from xmlrpc import client as xmlrpclib

def get_ltaproxy(username, password):
    return xmlrpclib.ServerProxy("https://"+username+':'+password+"@webportal.astron.nl/service-public/xmlrpc") 
