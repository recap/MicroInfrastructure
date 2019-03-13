
def get_surl_list(observation_id):
    from datetime import datetime
    from awlofar.database.Context import context
    from awlofar.main.aweimports import CorrelatedDataProduct, \
        FileObject, BeamFormedDataProduct, \
        Observation
    from awlofar.toolbox.LtaStager import LtaStager, LtaStagerError
    #cls = BeamFormedDataProduct
    cls = CorrelatedDataProduct
    print ("Looking for observation id: {0}".format(observation_id))
    query_observations = Observation.observationId == observation_id
    uris = []
    for observation in query_observations:
        print ("Querying observation id {0}".format(observation.observationId))
        dataproduct_query = cls.observations.contains(observation)
        dataproduct_query &= cls.isValid == 1
        for dataproduct in dataproduct_query:
            fileobject = ((FileObject.data_object == dataproduct) & (FileObject.isValid > 0)).max('creation_date')
            if fileobject:
                print ("  {}".format(fileobject.URI))
                uris.append(fileobject.URI)
            else:
                print ("No URI")
    return uris
