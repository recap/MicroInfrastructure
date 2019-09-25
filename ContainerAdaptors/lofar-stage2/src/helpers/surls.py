def get_surls(observation_id):
    from awlofar.database.Context import context
    from common.config.Profile import profiles
    from common.database.Database import database
    from awlofar.main.aweimports import CorrelatedDataProduct, \
        FileObject, BeamFormedDataProduct, Observation
    from awlofar.toolbox.LtaStager import LtaStager, LtaStagerError  

    if not database.connected():
        profile = profiles.get_current_profile()
        if profile is None:
            profile = profiles.create_profile()
        
        database.connect()

    cls = CorrelatedDataProduct

    query_observations = Observation.observationId == observation_id
    surls = []
    for observation in query_observations:
        dataproduct_query = cls.observations.contains(observation)
        dataproduct_query &= cls.isValid == 1
        for dataproduct in dataproduct_query:
            fileobject = ((FileObject.data_object == dataproduct) & (FileObject.isValid > 0)).max('creation_date')
            if fileobject:
                surls.append(fileobject.URI)

    return surls
